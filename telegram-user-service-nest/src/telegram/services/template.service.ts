// src/telegram/services/template.service.ts
//
// Responsabilidade única: envio de MessageTemplates.
// Templates do tipo COMBO e mídia pesada são enfileirados via BullMQ.
// Texto e operações leves são enviados diretamente.

import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { TelegramClient } from "telegram";
import { PrismaService } from "../../prisma/prisma.service";
import { MtprotoProvider } from "../providers/mtproto.provider";
import { BotApiProvider } from "../providers/bot-api.provider";
import { MediaService } from "./media.service";
import { BusinessCtx } from "../interfaces";
import { SendComboJobData, SendSingleMediaJobData } from "../interfaces";
import {
    QUEUE_NAME,
    SEND_COMBO_JOB,
    SEND_SINGLE_JOB,
} from "../constants/index";

@Injectable()
export class TemplateService {
    private readonly logger = new Logger(TemplateService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mtproto: MtprotoProvider,
        private readonly botApi: BotApiProvider,
        private readonly media: MediaService,
        @InjectQueue(QUEUE_NAME) private readonly messageQueue: Queue,
    ) {}

    // ── Entry point ───────────────────────────────────────────────────────

    /**
     * Envia um template.
     *
     * - TEXT → enviado direto (leve, sem risco de timeout)
     * - COMBO / mídia pesada → enfileirado no BullMQ (retry automático)
     *
     * Quando businessCtx está presente, usa Bot API obrigatoriamente.
     */
    async sendTemplate(
        botId: string,
        chatId: string,
        template: any,
        businessCtx?: BusinessCtx,
    ): Promise<void> {
        this.logger.debug(
            `[sendTemplate] id=${template.id} type=${template.type} business=${!!businessCtx}`,
        );

        // TEXT: envia direto — leve e sem risco de timeout
        if (template.type === "TEXT") {
            if (businessCtx) {
                await this.botApi.sendMessageHttp(
                    businessCtx.token,
                    chatId,
                    template.text || "",
                    {
                        business_connection_id:
                            businessCtx.businessConnectionId,
                    },
                );
            } else {
                const client = await this.ensureClient(botId);
                await client.sendMessage(chatId, {
                    message: template.text || "",
                });
            }
            return;
        }

        // COMBO → enfileira
        if (template.type === "COMBO" && template.mediaItems?.length > 0) {
            await this.messageQueue.add(
                SEND_COMBO_JOB,
                {
                    botId,
                    chatId,
                    template: this.serializeTemplate(template),
                    businessCtx,
                } as SendComboJobData,
                {
                    attempts: 3,
                    backoff: { type: "exponential", delay: 5000 },
                    removeOnComplete: { count: 100 },
                    removeOnFail: { count: 50 },
                },
            );
            this.logger.debug(
                `[sendTemplate] COMBO enfileirado para chatId=${chatId}`,
            );
            return;
        }

        // Mídia única → enfileira
        await this.messageQueue.add(
            SEND_SINGLE_JOB,
            {
                botId,
                chatId,
                template: this.serializeTemplate(template),
                businessCtx,
            } as SendSingleMediaJobData,
            {
                attempts: 3,
                backoff: { type: "exponential", delay: 3000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
            },
        );
        this.logger.debug(
            `[sendTemplate] ${template.type} enfileirado para chatId=${chatId}`,
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /** Serializa apenas os campos necessários — evita objetos circulares no job */
    private serializeTemplate(template: any) {
        return {
            id: template.id,
            type: template.type,
            text: template.text ?? null,
            mediaUrl: template.mediaUrl ?? null,
            telegramFileId: template.telegramFileId ?? null,
            mediaItems: (template.mediaItems ?? []).map((item: any) => ({
                id: item.id,
                url: item.url,
                type: item.type,
                order: item.order,
                telegramFileId: item.telegramFileId ?? null,
            })),
        };
    }

    private async ensureClient(botId: string): Promise<TelegramClient> {
        let client = this.mtproto.getClient(botId);
        if (!client || !client.connected) {
            const bot = await this.prisma.botAccount.findUnique({
                where: { id: botId },
            });
            if (!bot) throw new Error(`Bot not found: ${botId}`);
            await this.mtproto.initClient(bot);
            client = this.mtproto.getClient(botId);
            if (!client)
                throw new Error(
                    `Failed to initialize client for bot: ${botId}`,
                );
        }
        return client;
    }

    // ── DONT_SELL menu ────────────────────────────────────────────────────

    async sendDontSellMenu(
        botId: string,
        chatId: string | number,
        token: string,
        businessConnectionId: string,
    ): Promise<void> {
        const discountConfig = await this.prisma.discountConfig.findUnique({
            where: { botId },
            include: { product: true },
        });

        const products = discountConfig?.isActive
            ? [discountConfig.product]
            : await this.prisma.product.findMany({
                  where: { isActive: true },
                  orderBy: { priceCents: "asc" },
              });

        if (!products.length) return;

        const hasDiscount =
            discountConfig?.isActive && discountConfig?.discountText;
        const discountPercent = hasDiscount
            ? discountConfig.discountPercent
            : 0;

        const inlineKeyboard = products.map((p) => {
            if (hasDiscount) {
                const disc = Math.round(
                    p.priceCents * (1 - discountPercent / 100),
                );
                const orig = (p.priceCents / 100).toFixed(2).replace(".", ",");
                const discStr = (disc / 100).toFixed(2).replace(".", ",");
                return [
                    {
                        text: `${p.title} — R$ ${orig} → R$ ${discStr} (-${discountPercent}%)`,
                        callback_data: `buy_discount:${p.id}:${discountPercent}`,
                    },
                ];
            }
            return [
                {
                    text: `${p.title} — R$ ${(p.priceCents / 100).toFixed(2).replace(".", ",")}`,
                    callback_data: `buy:${p.id}`,
                },
            ];
        });

        const messageText = hasDiscount
            ? discountConfig.discountText
            : "🛍️ *Que tal aproveitar e garantir agora?* Escolha um produto:";

        await this.botApi.sendMessageHttp(token, chatId, String(messageText), {
            business_connection_id: businessConnectionId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: inlineKeyboard },
        });
    }
}
