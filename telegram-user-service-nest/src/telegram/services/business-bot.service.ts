// src/telegram/services/business-bot.service.ts
//
// Responsabilidade única: handlers de mensagens business e callbacks.
// Orquestra TemplateService, SchedulerService e MediaService.

import { Injectable, Logger } from "@nestjs/common";
import TelegramBot from "node-telegram-bot-api";
import { PrismaService } from "../../prisma/prisma.service";
import { SyncPayService } from "../../syncpay/syncpay.service";
import { BotApiProvider } from "../providers/bot-api.provider";
import { MtprotoProvider } from "../providers/mtproto.provider";
import { TemplateService } from "./template.service";
import { SchedulerService } from "./scheduler.service";
import { MediaService } from "./media.service";
import { MessageTemplateKey } from "@prisma/client";
import { BusinessCtx } from "../interfaces";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
    GREETING_TEXTS,
    DONT_SELL_AUTO_RULE_NAME,
    SEND_MENU_JOB,
    QUEUE_NAME,
} from "../constants";
import { ChatActionService } from "./chat-action.service";
import { MessageProcessor } from "../processors/message.processor";

@Injectable()
export class BusinessBotService {
    private readonly logger = new Logger(BusinessBotService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncPay: SyncPayService,
        private readonly botApi: BotApiProvider,
        private readonly mtproto: MtprotoProvider,
        private readonly templateService: TemplateService,
        private readonly scheduler: SchedulerService,
        private readonly media: MediaService,
        private readonly chatAction: ChatActionService,
        @InjectQueue(QUEUE_NAME) private readonly messageQueue: Queue,
    ) {}

    // ── Bot initialization ────────────────────────────────────────────────

    async initBusinessBot(botId: string, token: string): Promise<void> {
        if (this.botApi.hasBot(botId)) {
            this.logger.warn(`Business bot ${botId} já ativo, reiniciando...`);
            try {
                await this.botApi.getBot(botId)!.stopPolling();
                await new Promise((r) => setTimeout(r, 2000));
            } catch (_) {}
            this.botApi.deleteBot(botId);
        }

        this.botApi.setToken(botId, token);
        const bot = await this.botApi.createPollingBot(token);

        this.registerConnectionHandler(bot, botId);
        this.registerMessageHandler(bot, botId, token);
        this.registerCallbackHandler(bot, botId, token);

        this.botApi.setBot(botId, bot);

        // Carrega connections salvas no banco
        const saved = await this.prisma.businessConnection.findMany({
            where: { botId, isEnabled: true },
        });
        this.botApi.loadSavedConnections(
            botId,
            saved.map((c) => ({
                userTelegramId: c.userTelegramId,
                connectionId: c.connectionId,
            })),
        );

        this.logger.log(
            `[initBusinessBot] ${saved.length} connections carregadas para bot ${botId}`,
        );
    }

    // ── Connection handler ────────────────────────────────────────────────

    private registerConnectionHandler(bot: TelegramBot, botId: string): void {
        bot.on("business_connection" as any, async (connection: any) => {
            const { id: connectionId, user, is_enabled } = connection;

            if (!is_enabled) {
                this.logger.warn(
                    `Business connection revogada: ${connectionId}`,
                );
                this.botApi.deleteOwnerConnection(botId, String(user.id));
                await this.prisma.businessConnection.updateMany({
                    where: { connectionId },
                    data: { isEnabled: false },
                });
                return;
            }

            this.botApi.setOwnerConnection(
                botId,
                String(user.id),
                connectionId,
            );
            this.logger.log(
                `Business connection: user ${user.id} → ${connectionId}`,
            );

            await this.prisma.businessConnection.upsert({
                where: { connectionId },
                create: {
                    connectionId,
                    botId,
                    userTelegramId: String(user.id),
                    isEnabled: true,
                },
                update: { isEnabled: true, userTelegramId: String(user.id) },
            });
        });
    }

    // ── Message handler ───────────────────────────────────────────────────

    private registerMessageHandler(
        bot: TelegramBot,
        botId: string,
        token: string,
    ): void {
        bot.on("business_message" as any, async (msg: any) => {
            this.logger.debug(
                `[business_message RAW] ${JSON.stringify({
                    message_id: msg.message_id,
                    text: msg.text,
                    business_connection_id: msg.business_connection_id,
                    from: msg.from,
                    chat: msg.chat,
                })}`,
            );

            const text: string = (msg.text ?? "").toLowerCase().trim();
            const chatId: number = msg.chat.id;
            const userId: number = msg.from?.id;
            const businessConnectionId: string | undefined =
                msg.business_connection_id;

            if (msg.from?.is_bot || !businessConnectionId) return;

            // Ignora mensagens do próprio dono da conta business
            const ownerConn = await this.prisma.businessConnection.findFirst({
                where: { connectionId: businessConnectionId, isEnabled: true },
            });
            if (ownerConn && String(userId) === ownerConn.userTelegramId) {
                this.logger.debug(
                    `[business_message] ignorando mensagem do dono (userId=${userId})`,
                );
                return;
            }

            // Registra chatId → connectionId para o callback_query resolver corretamente
            this.botApi.setChatConnection(botId, chatId, businessConnectionId);
            this.logger.debug(
                `[business_message] chatId=${chatId} userId=${userId} connId=${businessConnectionId}`,
            );

            // Verifica se é novo usuário ANTES do upsert
            const existingUser = await this.prisma.telegramUser.findUnique({
                where: { chatId: chatId.toString() },
            });
            const isNewUser = !existingUser;

            await this.prisma.telegramUser.upsert({
                where: { chatId: chatId.toString() },
                update: {
                    lastSeenAt: new Date(),
                    username: msg.from?.username ?? null,
                    firstName: msg.from?.first_name ?? null,
                    lastName: msg.from?.last_name ?? null,
                },
                create: {
                    chatId: chatId.toString(),
                    telegramUserId: userId.toString(),
                    botId,
                    username: msg.from?.username ?? null,
                    firstName: msg.from?.first_name ?? null,
                    lastName: msg.from?.last_name ?? null,
                    firstSeenAt: new Date(),
                    lastSeenAt: new Date(),
                },
            });

            const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

            const sendMenu = async (
                message: string,
                buttons: {
                    text: string;
                    url?: string;
                    callbackData?: string;
                }[][],
            ) => {
                const inline_keyboard = buttons.map((row) =>
                    row.map((btn) => ({
                        text: btn.text,
                        ...(btn.url
                            ? { url: btn.url }
                            : { callback_data: btn.callbackData ?? "noop" }),
                    })),
                );
                await this.botApi.sendMessageHttp(token, chatId, message, {
                    business_connection_id: businessConnectionId,
                    parse_mode: "Markdown",
                    reply_markup: { inline_keyboard },
                });
            };

            if (GREETING_TEXTS.has(text)) {
                if (isNewUser) {
                    this.logger.debug(
                        `[business_message] novo usuário chatId=${chatId}, iniciando fluxo completo`,
                    );
                    // Fire-and-forget: handleGreeting tem delays internos e não pode bloquear o handler
                    this.handleGreeting(
                        botId,
                        chatId,
                        token,
                        businessConnectionId,
                        userId,
                        delay,
                        sendMenu,
                    ).catch((err) =>
                        this.logger.error(
                            `Erro no handleGreeting para ${chatId}:`,
                            err,
                        ),
                    );
                } else {
                    this.logger.debug(
                        `[business_message] usuário existente chatId=${chatId}, agendando DONT_SELL se aplicável`,
                    );
                    const hasPurchased = await this.prisma.sale.findFirst({
                        where: {
                            telegramUserId: userId.toString(),
                            status: "PAID",
                        },
                    });
                    if (!hasPurchased) {
                        this.scheduler
                            .scheduleDontSellJobs(
                                botId,
                                chatId,
                                userId,
                                businessConnectionId,
                            )
                            .catch((err) =>
                                this.logger.error(
                                    `Erro ao agendar DONT_SELL para ${chatId}:`,
                                    err,
                                ),
                            );
                    } else {
                        this.logger.debug(
                            `[business_message] usuário ${chatId} já comprou, nenhuma ação`,
                        );
                    }
                }
                return;
            }

            if (text === "💬 suporte") {
                await this.botApi
                    .sendMessageHttp(
                        token,
                        chatId,
                        "🙋 Nossa equipe entrará em contato em breve!",
                        { business_connection_id: businessConnectionId },
                    )
                    .catch((err) =>
                        this.logger.error(`Erro ao enviar suporte:`, err),
                    );
            }
        });
    }

    // ── Greeting flow ─────────────────────────────────────────────────────

    private async handleGreeting(
        botId: string,
        chatId: number,
        token: string,
        businessConnectionId: string,
        userId: number,
        delay: (ms: number) => Promise<unknown>,
        sendMenu: (message: string, buttons: any[][]) => Promise<void>,
    ): Promise<void> {
        // Todos os envios via Bot API — nunca MTProto em contexto business
        const businessCtx: BusinessCtx = { token, businessConnectionId, botId };

        const welcomeTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.WELCOME },
            include: { mediaItems: true },
        });
        if (welcomeTemplate) {
            await this.templateService.sendTemplate(
                botId,
                chatId.toString(),
                welcomeTemplate,
                businessCtx,
            );
        }

        const timedTemplates = await this.prisma.timedMessageRule.findMany({
            where: {
                botId,
                name: { not: DONT_SELL_AUTO_RULE_NAME }, // exclui a regra auto-gerada
            },
            include: { template: { include: { mediaItems: true } } },
            orderBy: { delaySeconds: "asc" },
        });

        // Wall clock: desconta o tempo gasto no sendTemplate anterior para timing preciso
        const greetingStart = Date.now();

        for (const timedTemplate of timedTemplates) {
            const templateId = timedTemplate.template?.id;
            const targetMs = timedTemplate.delaySeconds * 1000;
            const elapsedMs = Date.now() - greetingStart;
            const waitMs = targetMs - elapsedMs;

            if (waitMs > 0) {
                this.logger.debug(
                    `[handleGreeting] Aguardando ${(waitMs / 1000).toFixed(1)}s ` +
                        `para "${timedTemplate.name}" (alvo T+${timedTemplate.delaySeconds}s)`,
                );
                await delay(waitMs);
            }

            this.logger.debug(
                `[handleGreeting] Enviando "${timedTemplate.name}" ` +
                    `em T+${((Date.now() - greetingStart) / 1000).toFixed(1)}s (templateId=${templateId})`,
            );

            try {
                await this.templateService.sendTemplate(
                    botId,
                    chatId.toString(),
                    timedTemplate.template,
                    businessCtx,
                );
            } catch (err: any) {
                this.logger.error(
                    `[handleGreeting] Erro ao enviar "${timedTemplate.name}" ` +
                        `(${timedTemplate.template?.type}): ${err?.message ?? err}`,
                );
                if (err?.errors) {
                    this.logger.error(
                        `[handleGreeting] AggregateError details:`,
                        err.errors,
                    );
                }
            }
        }

        // Calcula o delay para o menu ser o último (ex: maior delay dos templates + 2 segundos)
        const maxTemplateDelay = timedTemplates.reduce(
            (max, t) => Math.max(max, t.delaySeconds),
            0,
        );
        const menuDelayMs = (maxTemplateDelay + 2) * 1000;

        await this.messageQueue.add(
            SEND_MENU_JOB,
            {
                token,
                chatId: chatId.toString(),
                businessConnectionId,
            },
            {
                delay: menuDelayMs, // O BullMQ segura o menu no Redis até esse tempo passar
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: true,
            },
        );

        this.scheduler.scheduleDontSellJobs(
            botId,
            chatId,
            userId,
            businessConnectionId,
        );
    }

    // ── Callback handler ──────────────────────────────────────────────────

    private registerCallbackHandler(
        bot: TelegramBot,
        botId: string,
        token: string,
    ): void {
        bot.on("callback_query" as any, async (query: any) => {
            const data: string = query.data ?? "";
            const chatId: number = query.message?.chat?.id ?? query.from?.id;
            const queryId: string = query.id;

            await this.botApi.answerCallbackQuery(token, queryId);

            // Resolve connection pelo chatId — não pela primeira connection genérica do bot
            const businessConnectionId =
                await this.botApi.resolveConnectionForChat(botId, chatId);
            if (!businessConnectionId) {
                this.logger.error(
                    `[callback_query] Nenhuma connection encontrada para chatId=${chatId} bot=${botId}`,
                );
                return;
            }

            const send = async (text: string, extra?: Record<string, any>) =>
                this.botApi.sendMessageHttp(token, chatId, text, {
                    business_connection_id: businessConnectionId,
                    parse_mode: "Markdown",
                    ...extra,
                });

            const userTelegram = await this.prisma.telegramUser.findUnique({
                where: { chatId: String(chatId) },
            });

            try {
                if (data === "list_products") {
                    await this.handleListProducts(send);
                    return;
                }
                if (data.startsWith("buy:")) {
                    await this.handleBuy(
                        data,
                        chatId,
                        botId,
                        token,
                        userTelegram,
                        send,
                    );
                    return;
                }
                if (data.startsWith("buy_discount:")) {
                    await this.handleBuyDiscount(
                        data,
                        chatId,
                        botId,
                        token,
                        userTelegram,
                        send,
                    );
                    return;
                }
                if (data === "support") {
                    await send("🙋 Nossa equipe entrará em contato em breve!");
                    return;
                }
            } catch (err) {
                this.logger.error(
                    `Erro no callback_query chatId=${chatId}:`,
                    err,
                );
                await send("❌ Ocorreu um erro. Tente novamente.").catch(
                    () => {},
                );
            }
        });
    }

    // ── Callback sub-handlers ─────────────────────────────────────────────

    private async handleListProducts(
        send: (text: string, extra?: any) => Promise<any>,
    ): Promise<void> {
        const products = await this.prisma.product.findMany({
            where: { isActive: true },
            orderBy: { priceCents: "asc" },
        });

        if (!products.length) {
            await send("😔 Nenhum produto disponível no momento.");
            return;
        }

        await send("🛍️ *Escolha o produto:*", {
            reply_markup: {
                inline_keyboard: products.map((p) => [
                    {
                        text: `${p.title} — R$ ${(p.priceCents / 100).toFixed(2).replace(".", ",")}`,
                        callback_data: `buy:${p.id}`,
                    },
                ]),
            },
        });
    }

    private async handleBuy(
        data: string,
        chatId: number,
        botId: string,
        token: string,
        userTelegram: any,
        send: (text: string, extra?: any) => Promise<any>,
    ): Promise<void> {
        const productId = data.split(":")[1];
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });
        if (!product) {
            const businessConnectionId =
                await this.botApi.resolveConnectionForChat(botId, chatId);
            await this.chatAction.sendActionBotApi(
                token,
                chatId,
                "typing",
                businessConnectionId,
                800,
            );
            await send("❌ Produto não encontrado.");
            return;
        }
        if (!userTelegram) {
            const businessConnectionId =
                await this.botApi.resolveConnectionForChat(botId, chatId);
            await this.chatAction.sendActionBotApi(
                token,
                chatId,
                "typing",
                businessConnectionId,
                800,
            );
            await send("❌ Usuário não encontrado.");
            return;
        }

        const businessConnectionId = await this.botApi.resolveConnectionForChat(
            botId,
            chatId,
        );
        await this.chatAction.sendActionBotApi(
            token,
            chatId,
            "typing",
            businessConnectionId,
            1500, // 1.5 segundos
        );
        await send(`Só um minutinho que já estou gerando seu pix tá`);

        const pixData = await this.syncPay.createCharge({
            amountCents: product.priceCents,
            productTitle: product.title,
            referenceId: String(chatId),
        });

        await this.prisma.sale.create({
            data: {
                botId,
                telegramUserId: userTelegram.telegramUserId,
                productId: product.id,
                amountCents: product.priceCents,
                referenceId: pixData.identifier,
                status: "PENDING",
                provider: "SYNCPAY",
                rawPayload: pixData as any,
            },
        });

        // ✅ AÇÃO: Gravando áudio antes de enviar o áudio PIX
        await this.chatAction.sendActionBotApi(
            token,
            chatId,
            "record_voice",
            businessConnectionId,
            2500, // 2.5 segundos gravando
        );

        await this.media
            .sendPixAudio(botId, chatId)
            .catch((err) =>
                this.logger.error(`Erro ao enviar áudio PIX:`, err),
            );

        // ✅ AÇÃO: Digitando antes de enviar mensagem do PIX
        await this.chatAction.sendActionBotApi(
            token,
            chatId,
            "typing",
            businessConnectionId,
            this.chatAction.calculateTypingDelay(
                this.buildPixMessage(
                    product,
                    pixData.pix_code,
                    product.priceCents,
                ),
            ),
        );

        await send(
            this.buildPixMessage(product, pixData.pix_code, product.priceCents),
        );
    }

    private async handleBuyDiscount(
        data: string,
        chatId: number,
        botId: string,
        token: string,
        userTelegram: any,
        send: (text: string, extra?: any) => Promise<any>,
    ): Promise<void> {
        const [, productId, percentStr] = data.split(":");
        const discountPercent = percentStr ? parseInt(percentStr) : 10;

        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            const businessConnectionId =
                await this.botApi.resolveConnectionForChat(botId, chatId);
            await this.chatAction.sendActionBotApi(
                token,
                chatId,
                "typing",
                businessConnectionId,
                800,
            );
            await send("❌ Produto não encontrado.");
            return;
        }
        if (!userTelegram) {
            const businessConnectionId =
                await this.botApi.resolveConnectionForChat(botId, chatId);
            await this.chatAction.sendActionBotApi(
                token,
                chatId,
                "typing",
                businessConnectionId,
                800,
            );
            await send("❌ Usuário não encontrado.");
            return;
        }

        // ✅ AÇÃO: Digitando antes de avisar que está gerando
        const businessConnectionId = await this.botApi.resolveConnectionForChat(
            botId,
            chatId,
        );
        await this.chatAction.sendActionBotApi(
            token,
            chatId,
            "typing",
            businessConnectionId,
            1200,
        );

        await send(`⏳ Gerando PIX para *${product.title}*...`);

        const finalAmountCents = Math.round(
            product.priceCents * (1 - discountPercent / 100),
        );

        const pixData = await this.syncPay.createCharge({
            amountCents: finalAmountCents,
            productTitle: product.title,
            referenceId: String(chatId),
        });

        await this.prisma.sale.create({
            data: {
                botId,
                telegramUserId: userTelegram.telegramUserId,
                productId: product.id,
                amountCents: finalAmountCents,
                referenceId: pixData.identifier,
                status: "PENDING",
                provider: "SYNCPAY",
                rawPayload: pixData as any,
            },
        });

        // ✅ AÇÃO: Gravando áudio antes de enviar
        await this.chatAction.sendActionBotApi(
            token,
            chatId,
            "record_voice",
            businessConnectionId,
            2500,
        );

        await this.media
            .sendPixAudio(botId, chatId)
            .catch((err) =>
                this.logger.error(`Erro ao enviar áudio PIX:`, err),
            );

        // ✅ AÇÃO: Digitando antes da mensagem final
        await this.chatAction.sendActionBotApi(
            token,
            chatId,
            "typing",
            businessConnectionId,
            this.chatAction.calculateTypingDelay(
                this.buildPixMessage(
                    product,
                    pixData.pix_code,
                    finalAmountCents,
                    discountPercent,
                ),
            ),
        );

        await send(
            this.buildPixMessage(
                product,
                pixData.pix_code,
                finalAmountCents,
                discountPercent,
            ),
        );
    }

    private buildPixMessage(
        product: { title: string; priceCents: number },
        pixCode: string,
        finalAmountCents: number,
        discountPercent?: number,
    ): string {
        const price = (finalAmountCents / 100).toFixed(2).replace(".", ",");
        const discountLine = discountPercent
            ? `💰 Valor com desconto: *R$ ${price}* (-${discountPercent}%)`
            : `💰 Valor: *R$ ${price}*`;

        return [
            `✅ *PIX gerado com sucesso!*`,
            ``,
            `🏷️ *${product.title}*`,
            discountLine,
            ``,
            `📋 *Copia e Cola:*`,
            `\`${pixCode}\``,
            ``,
            `⏰ Válido por 30 minutos`,
            ``,
            `Após o pagamento você receberá a confirmação automaticamente!`,
        ].join("\n");
    }
}
