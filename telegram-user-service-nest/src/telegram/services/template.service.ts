// src/telegram/services/template.service.ts
//
// Responsabilidade única: envio de MessageTemplates.
// Conhece o esquema de roteamento MTProto vs Bot API, mas delega
// as operações técnicas de mídia ao MediaService.

import { Injectable, Logger } from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import { PrismaService } from "../../prisma/prisma.service";
import { MtprotoProvider } from "../providers/mtproto.provider";
import { BotApiProvider } from "../providers/bot-api.provider";
import { MediaService } from "./media.service";
import { BusinessCtx, MediaItem, ReadyItem } from "../interfaces";

@Injectable()
export class TemplateService {
    private readonly logger = new Logger(TemplateService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mtproto: MtprotoProvider,
        private readonly botApi: BotApiProvider,
        private readonly media: MediaService,
    ) {}

    // ── Entry point ───────────────────────────────────────────────────────

    /**
     * Envia um template para o chatId.
     *
     * Quando businessCtx está presente, usa Bot API obrigatoriamente —
     * misturar MTProto com Bot API em contexto business causa BUSINESS_PEER_INVALID.
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

        if (businessCtx) {
            await this.sendTemplateViaBotApi(chatId, template, businessCtx);
            return;
        }

        // MTProto path
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

        try {
            if (template.type === "TEXT") {
                await client.sendMessage(chatId, {
                    message: template.text || "",
                });
                return;
            }
            if (template.type === "COMBO" && template.mediaItems?.length > 0) {
                await this.sendCombo(client, chatId, template);
                return;
            }
            await this.sendSingleMedia(client, chatId, template);
        } catch (error) {
            this.logger.error(
                `Error sending template to ${chatId} via bot ${botId}:`,
                error,
            );
            throw error;
        }
    }

    // ── Bot API path ──────────────────────────────────────────────────────

    private async sendTemplateViaBotApi(
        chatId: string,
        template: any,
        ctx: BusinessCtx,
    ): Promise<void> {
        const base = { business_connection_id: ctx.businessConnectionId };

        const sendText = async (text: string) => {
            if (!text?.trim()) return;
            await this.botApi.sendMessageHttp(ctx.token, chatId, text, base);
        };

        // ── TEXT ──────────────────────────────────────────────────────────
        if (template.type === "TEXT") {
            await sendText(template.text || "");
            return;
        }

        // ── Mídia única ───────────────────────────────────────────────────
        if (template.type !== "COMBO") {
            const url =
                template.mediaUrl || template.mediaItems?.[0]?.url || "";
            const fileId =
                template.telegramFileId ||
                template.mediaItems?.[0]?.telegramFileId;
            const itemId = template.mediaItems?.[0]?.id ?? template.id;

            if (!url) {
                this.logger.warn(
                    `[sendTemplateViaBotApi] Template ${template.id} sem URL de mídia`,
                );
                if (template.text) await sendText(template.text);
                return;
            }

            const meta = this.media.getMediaMeta(url);
            this.logger.debug(
                `[sendTemplateViaBotApi] single media isAudio=${meta.isAudio} isVideo=${meta.isVideo} hasFileId=${!!fileId}`,
            );

            if (meta.isAudio) {
                await this.media.sendVoiceBotApi(ctx.token, chatId, base, {
                    url,
                    fileId,
                    itemId,
                });
            } else if (meta.isVideo) {
                await this.media.sendVideosMtproto(ctx.botId, chatId, base, [
                    { url, fileId, itemId },
                ]);
            } else {
                await this.media.sendPhotoGroup(ctx.token, chatId, base, [
                    { url, fileId, itemId },
                ]);
            }
            return;
        }

        // ── COMBO ─────────────────────────────────────────────────────────
        if (template.mediaItems?.length > 0) {
            const sorted = [...template.mediaItems].sort(
                (a: any, b: any) => a.order - b.order,
            );

            const photos: MediaItem[] = [];
            const videos: MediaItem[] = [];
            const audios: MediaItem[] = [];

            for (const item of sorted) {
                const meta = this.media.getMediaMeta(item.url);
                const entry: MediaItem = {
                    url: item.url,
                    fileId: item.telegramFileId ?? undefined,
                    itemId: item.id,
                };
                if (meta.isAudio) audios.push(entry);
                else if (meta.isVideo) videos.push(entry);
                else photos.push(entry);
            }

            const hasVisual = photos.length > 0 || videos.length > 0;
            if (template.text && !hasVisual) await sendText(template.text);

            if (photos.length > 0) {
                await this.media.sendPhotoGroup(
                    ctx.token,
                    chatId,
                    base,
                    photos,
                );
                await new Promise((r) => setTimeout(r, 400));
            }
            if (videos.length > 0) {
                await this.media.sendVideosMtproto(
                    ctx.botId,
                    chatId,
                    base,
                    videos,
                );
                await new Promise((r) => setTimeout(r, 400));
            }
            for (const audio of audios) {
                await this.media.sendVoiceBotApi(
                    ctx.token,
                    chatId,
                    base,
                    audio,
                );
                await new Promise((r) => setTimeout(r, 300));
            }
        }
    }

    // ── MTProto path ──────────────────────────────────────────────────────

    private async sendCombo(
        client: TelegramClient,
        chatId: string,
        template: any,
    ): Promise<void> {
        const sortedMedia = [...template.mediaItems].sort(
            (a: any, b: any) => a.order - b.order,
        );

        if (template.text) {
            await client.sendMessage(chatId, { message: template.text });
            await new Promise((r) => setTimeout(r, 300));
        }

        const peer = await client.getInputEntity(chatId);
        const readyItems: ReadyItem[] = [];
        for (const item of sortedMedia) {
            readyItems.push(await this.media.prepareMedia(item, client, peer));
        }

        let imageQueue: Api.InputSingleMedia[] = [];

        const flushImages = async () => {
            if (!imageQueue.length) return;
            if (imageQueue.length === 1) {
                await client.invoke(
                    new Api.messages.SendMedia({
                        peer,
                        media: imageQueue[0].media,
                        message: "",
                        randomId: this.mtproto.makeRandomId(),
                    }),
                );
            } else {
                await client.invoke(
                    new Api.messages.SendMultiMedia({
                        peer,
                        multiMedia: imageQueue,
                    }),
                );
            }
            imageQueue = [];
            await new Promise((r) => setTimeout(r, 400));
        };

        for (const readyItem of readyItems) {
            if (readyItem.isImage) {
                imageQueue.push(
                    new Api.InputSingleMedia({
                        media: readyItem.finalMedia,
                        message: "",
                        randomId: this.mtproto.makeRandomId(),
                    }),
                );
            } else {
                await flushImages();
                await client.invoke(
                    new Api.messages.SendMedia({
                        peer,
                        media: readyItem.finalMedia,
                        message: "",
                        randomId: this.mtproto.makeRandomId(),
                    }),
                );
                await new Promise((r) => setTimeout(r, 400));
            }
        }

        await flushImages();
    }

    private async sendSingleMedia(
        client: TelegramClient,
        chatId: string,
        template: any,
    ): Promise<void> {
        const mediaUrl = template.mediaUrl || "";
        const meta = this.media.getMediaMeta(mediaUrl);
        const filename = `file.${meta.ext}`;
        const fileBuffer = await this.media.fetchFileBuffer(mediaUrl);

        if (meta.isVideo || meta.isAudio) {
            const uploadedFile = await this.media.uploadFromBuffer(
                client,
                filename,
                fileBuffer,
            );
            const media = this.media.buildInputMedia(
                uploadedFile,
                meta,
                filename,
                false,
            );
            await client.invoke(
                new Api.messages.SendMedia({
                    peer: await client.getInputEntity(chatId),
                    media,
                    message: template.text || "",
                    randomId: this.mtproto.makeRandomId(),
                }),
            );
        } else {
            await client.sendFile(chatId, {
                file: fileBuffer,
                caption: template.text || undefined,
                forceDocument: false,
            });
        }
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
