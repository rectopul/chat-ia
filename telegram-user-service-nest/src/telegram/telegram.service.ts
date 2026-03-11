import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
} from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import { NewMessage, NewMessageEvent, Raw } from "telegram/events";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import { Buffer } from "buffer";
import bigInt from "big-integer";
import TelegramBot, { KeyboardButton } from "node-telegram-bot-api";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SyncPayService } from "../syncpay/syncpay.service";

type ReadyItem = {
    finalMedia: Api.TypeInputMedia;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
};

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TelegramService.name);

    private clients: Map<string, TelegramClient> = new Map();
    private tempClients = new Map<
        string,
        { client: TelegramClient; phoneCodeHash?: string }
    >();
    private businessBots: Map<string, TelegramBot> = new Map();
    private businessBotTokens: Map<string, string> = new Map();
    private businessConnections: Map<string, string> = new Map();

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncPayService: SyncPayService,
    ) {}

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    async onModuleInit() {
        const accounts = await this.prisma.botAccount.findMany({
            where: {
                isUserAccount: true,
                session: { not: null },
                isActive: true,
            },
        });

        for (const account of accounts) {
            try {
                await this.initClient(account);
                this.logger.log(`Client MTProto ${account.name} conectado.`);

                if (account.businessBotToken) {
                    await this.initBusinessBot(
                        account.id,
                        account.businessBotToken,
                    );
                    this.logger.log(`Business bot ${account.name} conectado.`);
                }
            } catch (err) {
                this.logger.error(`Falha ao iniciar ${account.name}:`, err);
            }
        }
    }

    async onModuleDestroy() {
        for (const [id, client] of this.clients.entries()) {
            try {
                await client.disconnect();
            } catch (e) {
                this.logger.error(`Error disconnecting client ${id}:`, e);
            }
        }
        this.clients.clear();

        for (const [id, bot] of this.businessBots.entries()) {
            try {
                await bot.stopPolling();
            } catch (e) {
                this.logger.error(`Error stopping business bot ${id}:`, e);
            }
        }
        this.businessBots.clear();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Helpers privados
    // ─────────────────────────────────────────────────────────────────────

    private async convertToOggOpus(
        inputBuffer: Buffer,
        inputExt: string,
    ): Promise<Buffer> {
        const ffmpeg = require("fluent-ffmpeg");
        const tmpInput = path.join(
            os.tmpdir(),
            `tg_audio_in_${Date.now()}.${inputExt}`,
        );
        const tmpOutput = path.join(
            os.tmpdir(),
            `tg_audio_out_${Date.now()}.ogg`,
        );

        await fs.promises.writeFile(tmpInput, inputBuffer);

        await new Promise<void>((resolve, reject) => {
            ffmpeg(tmpInput)
                .audioCodec("libopus")
                .audioChannels(1)
                .audioFrequency(48000)
                .format("ogg")
                .on("end", resolve)
                .on("error", reject)
                .save(tmpOutput);
        });

        const outputBuffer = await fs.promises.readFile(tmpOutput);

        // Limpa arquivos temporários
        await fs.promises.unlink(tmpInput).catch(() => {});
        await fs.promises.unlink(tmpOutput).catch(() => {});

        return outputBuffer;
    }

    private async fetchFileBuffer(
        url: string,
        forceOgg = false, // ✅ flag para conversão de voz
    ): Promise<Buffer> {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        let buffer = Buffer.from(response.data);

        const rawExt = (
            url.split(".").pop()?.split(/[#?]/)[0] ?? ""
        ).toLowerCase();

        // Converte WebP → JPEG
        if (rawExt === "webp") {
            const sharp = require("sharp");
            buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
            return buffer;
        }

        // ✅ Converte qualquer áudio → OGG Opus (para voz do Telegram)
        const isAudio = ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(
            rawExt,
        );
        if (forceOgg && isAudio && rawExt !== "ogg") {
            buffer = await this.convertToOggOpus(buffer, rawExt);
            return buffer;
        }

        return buffer;
    }

    private getMediaMeta(url: string): {
        ext: string;
        mimeType: string;
        isVideo: boolean;
        isAudio: boolean;
        isImage: boolean;
    } {
        const rawExt = (
            url.split(".").pop()?.split(/[#?]/)[0] ?? "jpg"
        ).toLowerCase();

        // ✅ Telegram não suporta WebP — converte para jpg
        const ext = rawExt === "webp" ? "jpg" : rawExt;
        const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
        const isAudio = ["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(
            ext,
        );
        const isImage = !isVideo && !isAudio;

        let mimeType = "image/jpeg";
        if (ext === "png") mimeType = "image/png";
        if (ext === "gif") mimeType = "image/gif";
        if (isVideo) mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";
        if (isAudio) mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;

        return { ext, mimeType, isVideo, isAudio, isImage };
    }

    private async uploadFromBuffer(
        client: TelegramClient,
        filename: string,
        buffer: Buffer,
    ): Promise<Api.TypeInputFile> {
        const tmpPath = path.join(os.tmpdir(), `tg_${Date.now()}_${filename}`);
        await fs.promises.writeFile(tmpPath, buffer);
        try {
            const customFile = new CustomFile(filename, buffer.length, tmpPath);
            return await client.uploadFile({ file: customFile, workers: 3 });
        } finally {
            await fs.promises.unlink(tmpPath).catch(() => {});
        }
    }

    private makeRandomId() {
        return bigInt(Math.floor(Math.random() * 1e15).toString());
    }

    private buildInputMedia(
        uploadedFile: Api.TypeInputFile,
        meta: ReturnType<TelegramService["getMediaMeta"]>,
        filename: string,
        forAlbum: boolean,
    ): Api.TypeInputMedia {
        const { mimeType, isVideo, isAudio } = meta;

        if (isVideo) {
            return new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType,
                attributes: [
                    new Api.DocumentAttributeVideo({
                        duration: 0,
                        w: 0,
                        h: 0,
                        supportsStreaming: true,
                        roundMessage: false,
                    }),
                    new Api.DocumentAttributeFilename({ fileName: filename }),
                ],
            });
        }

        if (isAudio) {
            return new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType,
                attributes: [
                    new Api.DocumentAttributeAudio({
                        duration: 0,
                        voice: true,
                    }),
                    new Api.DocumentAttributeFilename({ fileName: filename }),
                ],
            });
        }

        if (forAlbum) {
            return new Api.InputMediaUploadedPhoto({
                file: uploadedFile,
            });
        }

        return new Api.InputMediaUploadedPhoto({ file: uploadedFile });
    }

    private async prepareMedia(
        item: any,
        client: TelegramClient,
        peer: Api.TypeInputPeer,
    ) {
        try {
            const meta = this.getMediaMeta(item.url);
            const filename = `file_${new Date().toISOString()}.${meta.ext}`;

            this.logger.debug(
                `[PREPARING item ${filename}] ext=${meta.ext} isVideo=${meta.isVideo} isImage=${meta.isImage}`,
            );

            const fileBuffer = await this.fetchFileBuffer(item.url);
            const uploadedFile = await this.uploadFromBuffer(
                client,
                filename,
                fileBuffer,
            );
            const uploadedMedia = this.buildInputMedia(
                uploadedFile,
                meta,
                filename,
                true,
            );

            // ✅ UploadMedia converte para InputMediaPhoto/Document processado pelo servidor
            const serverMedia = await client.invoke(
                new Api.messages.UploadMedia({
                    peer,
                    media: uploadedMedia,
                }),
            );

            let finalMedia: Api.TypeInputMedia;
            if (
                serverMedia instanceof Api.MessageMediaPhoto &&
                serverMedia.photo
            ) {
                const p = serverMedia.photo as Api.Photo;
                finalMedia = new Api.InputMediaPhoto({
                    id: new Api.InputPhoto({
                        id: p.id,
                        accessHash: p.accessHash,
                        fileReference: p.fileReference,
                    }),
                });
            } else if (
                serverMedia instanceof Api.MessageMediaDocument &&
                serverMedia.document
            ) {
                const d = serverMedia.document as Api.Document;
                finalMedia = new Api.InputMediaDocument({
                    id: new Api.InputDocument({
                        id: d.id,
                        accessHash: d.accessHash,
                        fileReference: d.fileReference,
                    }),
                });
            } else {
                throw new Error(
                    `UploadMedia retornou tipo inesperado: ${serverMedia.className}`,
                );
            }

            this.logger.debug(
                `[READY item ${filename}] UploadMedia OK -> ${finalMedia.className}`,
            );
            return {
                finalMedia,
                isImage: meta.isImage,
                isVideo: meta.isVideo,
                isAudio: meta.isAudio,
            };
        } catch (error) {
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // HTTP helper para Business Bot API
    // ─────────────────────────────────────────────────────────────────────

    private async sendMessageHttp(
        token: string,
        chatId: number | string,
        text: string,
        extra?: Record<string, any>,
    ): Promise<any> {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const payload = {
            chat_id: chatId,
            text,
            ...extra,
            ...(extra?.reply_markup
                ? { reply_markup: JSON.stringify(extra.reply_markup) }
                : {}),
        };

        this.logger.debug("sendMessage payload: " + JSON.stringify(payload));
        const { data } = await axios.post(url, payload);
        if (!data.ok)
            throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
        return data.result;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Business Bot
    // ─────────────────────────────────────────────────────────────────────

    /** Remove o "loading" do botão após o clique */
    private async answerCallbackQuery(
        token: string,
        queryId: string,
    ): Promise<void> {
        try {
            await axios.post(
                `https://api.telegram.org/bot${token}/answerCallbackQuery`,
                {
                    callback_query_id: queryId,
                },
            );
        } catch (_) {}
    }

    private async send(
        text: string,
        token: string,
        chatId: string,
        businessConnectionId: string,
        extra?: Record<string, any>,
    ) {
        await this.sendMessageHttp(token, chatId, text, {
            business_connection_id: businessConnectionId,
            parse_mode: "Markdown",
            ...extra,
        });
    }

    async initBusinessBot(botId: string, token: string): Promise<void> {
        if (this.businessBots.has(botId)) {
            this.logger.warn(`Business bot ${botId} já ativo, reiniciando...`);
            try {
                await this.businessBots.get(botId)!.stopPolling();
            } catch (_) {}
            this.businessBots.delete(botId);
        }

        // ✅ Força o Telegram a encerrar qualquer getUpdates anterior
        // Chamando getUpdates com timeout=0 e offset=-1 mata a sessão pendente
        try {
            const { data } = await axios.post(
                `https://api.telegram.org/bot${token}/getUpdates`,
                { timeout: 0, offset: -1 },
            );

            this.logger.log("[LIMPEZA DE SESSIOES]: ", data);
        } catch (_) {}

        // ✅ Aguarda o Telegram liberar (necessário após matar sessão anterior)
        await new Promise((r) => setTimeout(r, 1000));

        this.businessBotTokens.set(botId, token);

        const bot = new TelegramBot(token, {
            polling: {
                interval: 300,
                autoStart: true,
                params: {
                    timeout: 10,
                    allowed_updates: [
                        "message",
                        "business_connection",
                        "callback_query",
                        "business_message",
                        "deleted_business_messages",
                    ],
                },
            },
        });

        bot.on("business_connection" as any, async (connection: any) => {
            const { id: connectionId, user, is_enabled } = connection;
            const key = `${botId}:${user.id}`;

            if (!is_enabled) {
                this.logger.warn(
                    `Business connection revogada: ${connectionId}`,
                );
                this.businessConnections.delete(key);
                await this.prisma.businessConnection.updateMany({
                    where: { connectionId },
                    data: { isEnabled: false },
                });
                return;
            }

            this.businessConnections.set(key, connectionId);
            this.logger.log(
                `Business connection: user ${user.id} → ${connectionId}`,
            );

            this.logger.log(
                `[SAVE BUSINESS CONNECTION]: user ${user.id} → ${connectionId}`,
            );

            await this.prisma.businessConnection.upsert({
                where: { connectionId },
                create: {
                    connectionId,
                    botId,
                    userTelegramId: String(user.id),
                    isEnabled: true,
                },
                update: { isEnabled: true },
            });
        });

        bot.on("business_message" as any, async (msg: any) => {
            const text: string = (msg.text ?? "").toLowerCase().trim();
            const chatId: number = msg.chat.id;
            const userId: number = msg.from?.id;
            const businessConnectionId: string | undefined =
                msg.business_connection_id;

            this.logger.debug(
                `business_message — chat: ${chatId}, texto: "${text}", connectionId: ${businessConnectionId}`,
            );

            if (!businessConnectionId) return;

            // upinsertUserid
            const userTelegram = await this.prisma.telegramUser.upsert({
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

            // ── Helpers locais ────────────────────────────────────────────

            /**
             * ⚠️ LIMITAÇÃO DE BUSINESS BOTS:
             * Reply keyboard só aparece para o DONO da conta business, não para o cliente.
             * A solução correta é inline keyboard com URLs — funciona para todos.
             */
            const sendMenu = async (
                message: string,
                buttons: {
                    text: string;
                    url?: string;
                    callbackData?: string;
                }[][],
            ) => {
                // 1. Função robusta de escape para MarkdownV2
                const escapeV2 = (s: string) =>
                    s.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");

                try {
                    // 2. Aplicamos o escape na mensagem recebida
                    // Se a mensagem já vier com marcações propositais (como * para negrito),
                    // o ideal é tratar o que é conteúdo e o que é marcação.
                    // Aqui, vou escapar apenas o que não for marcação de negrito.
                    const escapedMessage = escapeV2(message).replace(
                        /\\\*/g,
                        "*",
                    );

                    await this.sendMessageHttp(token, chatId, escapedMessage, {
                        business_connection_id: businessConnectionId,
                        parse_mode: "MarkdownV2",
                        reply_markup: {
                            inline_keyboard: buttons.map((row) =>
                                row.map((btn) => ({
                                    text: btn.text, // Texto do botão não precisa de escape
                                    ...(btn.url
                                        ? { url: btn.url }
                                        : {
                                              callback_data:
                                                  btn.callbackData ?? "noop",
                                          }),
                                })),
                            ),
                        },
                    });
                } catch (err: any) {
                    this.logger.error(
                        `Erro ao enviar menu: ${err.response?.data?.description || err.message}`,
                    );

                    // Fallback sem Markdown para garantir que o usuário não fique no vácuo
                    await this.sendMessageHttp(
                        token,
                        chatId,
                        "Olá! Escolha uma opção no menu abaixo:",
                        {
                            business_connection_id: businessConnectionId,
                            reply_markup: {
                                inline_keyboard: buttons.map((row) =>
                                    row.map((btn) => ({
                                        text: btn.text,
                                        callback_data:
                                            btn.callbackData ?? "noop",
                                    })),
                                ),
                            },
                        },
                    );
                }
            };

            const sendText = async (message: string) => {
                await this.sendMessageHttp(token, chatId, message, {
                    business_connection_id: businessConnectionId,
                    reply_markup: { remove_keyboard: true },
                });
            };

            // ── /start ou saudação → menu principal ───────────────────────
            if (
                text === "/start" ||
                text === "oi" ||
                text === "olá" ||
                text === "ola" ||
                text === "bom dia" ||
                text === "boa noite" ||
                text === "boa tarde" ||
                text.includes("ae") ||
                text.includes("bom") ||
                text.includes("boa") ||
                text.includes("oi") ||
                text === "menu"
            ) {
                try {
                    // get weallcome template

                    const weallcomeTemplate =
                        await this.prisma.messageTemplate.findFirst({
                            where: {
                                key: "WELCOME",
                            },
                            include: { mediaItems: true },
                        });

                    if (weallcomeTemplate) {
                        await this.sendTemplate(
                            botId,
                            chatId.toString(),
                            weallcomeTemplate,
                        );
                    }

                    // timed templates
                    const timedTemplates =
                        await this.prisma.timedMessageRule.findMany({
                            where: { botId },
                            include: {
                                template: {
                                    include: { mediaItems: true }, // ✅ inclui mediaItems do template
                                },
                            },
                            orderBy: { delaySeconds: "asc" }, // ✅ garante ordem crescente de delay
                        });

                    const delay = (ms: number) =>
                        new Promise((resolve) => setTimeout(resolve, ms));

                    for (const timedTemplate of timedTemplates) {
                        await delay(timedTemplate.delaySeconds * 1000);

                        await this.sendTemplate(
                            botId,
                            chatId.toString(),
                            timedTemplate.template, // ✅ passa o template, não a regra
                        );
                    }

                    await sendMenu(
                        "👋 Olá! Gostou das prévias, que tal adquirir um dos nossos planos e receber mais conteúdos exclusivos?",
                        [
                            [
                                {
                                    text: "🛍️ Ver Produtos",
                                    callbackData: "list_products",
                                },
                            ],
                            [{ text: "💬 Suporte", callbackData: "support" }],
                        ],
                    );

                    // ✅ Fire and forget — não bloqueia o handler
                    (async () => {
                        try {
                            await delay(240000); // 4 minutos

                            // ✅ Verifica se o usuário já comprou antes de enviar DONT_SELL
                            const hasPurchased =
                                await this.prisma.sale.findFirst({
                                    where: {
                                        telegramUserId: userId.toString(),
                                        createdAt: {
                                            gte: new Date(Date.now() - 20000),
                                        },
                                    },
                                });

                            if (hasPurchased) return; // Já comprou, não incomoda

                            const dontsellTemplate =
                                await this.prisma.messageTemplate.findFirst({
                                    where: { key: "DONT_SELL" },
                                    include: { mediaItems: true },
                                });

                            if (dontsellTemplate) {
                                await this.sendTemplate(
                                    botId,
                                    chatId.toString(),
                                    dontsellTemplate,
                                );
                            }

                            // Busca businessConnectionId
                            let bcId: string | undefined;
                            for (const [
                                key,
                                connId,
                            ] of this.businessConnections.entries()) {
                                if (key.startsWith(`${botId}:`)) {
                                    bcId = connId;
                                    break;
                                }
                            }

                            if (!bcId) {
                                const conn =
                                    await this.prisma.businessConnection.findFirst(
                                        {
                                            where: { botId, isEnabled: true },
                                        },
                                    );
                                bcId = conn?.connectionId;
                            }

                            if (!bcId) return;

                            // ✅ Busca configuração de desconto do bot
                            const discountConfig =
                                await this.prisma.discountConfig.findUnique({
                                    where: { botId },
                                    include: { product: true },
                                });

                            // ✅ Fallback: se não houver config, busca todos os produtos ativos
                            const products = discountConfig?.isActive
                                ? [discountConfig.product]
                                : await this.prisma.product.findMany({
                                      where: { isActive: true },
                                      orderBy: { priceCents: "asc" },
                                  });

                            if (!products.length) return;

                            const discountPercent = discountConfig?.isActive
                                ? discountConfig.discountPercent
                                : 10; // fallback 10%

                            const firstProduct =
                                await this.prisma.product.findFirst({
                                    where: { isActive: true },
                                    orderBy: { priceCents: "asc" },
                                });

                            const inlineKeyboard = products.map((p) => {
                                const discountAmount = Math.round(
                                    p.priceCents * (discountPercent / 100),
                                );
                                const discountedCents =
                                    p.priceCents - discountAmount;
                                const originalPrice = (p.priceCents / 100)
                                    .toFixed(2)
                                    .replace(".", ",");
                                const discountedPrice = (discountedCents / 100)
                                    .toFixed(2)
                                    .replace(".", ",");

                                return [
                                    {
                                        text: `${p.title} — ~~R$ ${originalPrice}~~ R$ ${discountedPrice} (-${discountPercent}%)`,
                                        callback_data: `buy_discount:${p.id}:${discountPercent}`,
                                    },
                                ];
                            });

                            await this.send(
                                `🔥 *Oferta especial por tempo limitado!*\n\nGanhe *${discountPercent}% de desconto* agora:`,
                                token,
                                chatId.toString(),
                                bcId,
                                {
                                    reply_markup: {
                                        inline_keyboard: inlineKeyboard,
                                    },
                                },
                            );
                        } catch (err) {
                            this.logger.error(
                                `Erro no DONT_SELL para chatId=${chatId}:`,
                                err,
                            );
                        }
                    })();
                } catch (err) {
                    this.logger.error(
                        `Erro ao enviar menu para ${chatId}:`,
                        err,
                    );
                }
                return;
            }

            // ── Ver Produtos → o clique no botão é tratado pelo BotCallbackQuery
            // no client user (GramJS). Aqui só tratamos o texto caso o cliente
            // tenha digitado manualmente (fallback).
            if (text === "🛍️ ver produtos") {
                await sendMenu("🛍️ *Nossos Produtos* — escolha abaixo:", [
                    [
                        {
                            text: "🛍️ Ver Produtos",
                            callbackData: "list_products",
                        },
                    ],
                ]);
                return;
            }

            // ── Suporte ───────────────────────────────────────────────────
            if (text === "💬 suporte") {
                try {
                    await sendText(
                        "🙋 Nossa equipe entrará em contato em breve!",
                    );
                } catch (err) {
                    this.logger.error(`Erro suporte para ${chatId}:`, err);
                }
                return;
            }
        });

        // ── callback_query: cliques em botões inline ─────────────────
        // O business bot recebe callback_query normalmente via polling.
        // O client user (MTProto) NÃO recebe — só o bot recebe.
        bot.on("callback_query" as any, async (query: any) => {
            const data: string = query.data ?? "";
            const chatId: number = query.message?.chat?.id ?? query.from?.id;
            const queryId: string = query.id;
            const userTelegram = await this.prisma.telegramUser.findUnique({
                where: {
                    chatId: String(chatId),
                },
            });

            this.logger.debug(
                `[callback_query] data="${data}" chatId=${chatId}`,
            );

            // Responde ao Telegram para remover o "loading" do botão
            await this.answerCallbackQuery(token, queryId);

            // Busca a business_connection pelo botId — pega a primeira ativa.
            // A connection é do dono da conta business, não do cliente.
            // O chatId do cliente vai no chat_id da mensagem.
            let businessConnectionId: string | undefined;

            // 1. Tenta via mapa em memória (botId:ownerTelegramId → connectionId)
            for (const [key, connId] of this.businessConnections.entries()) {
                if (key.startsWith(`${botId}:`)) {
                    businessConnectionId = connId;
                    break;
                }
            }

            // 2. Fallback: busca no banco
            if (!businessConnectionId) {
                const conn = await this.prisma.businessConnection.findFirst({
                    where: { botId, isEnabled: true },
                });
                businessConnectionId = conn?.connectionId;
            }

            this.logger.debug(
                `[callback_query] businessConnectionId=${businessConnectionId}`,
            );

            if (!businessConnectionId) {
                this.logger.error(
                    `Nenhuma business connection ativa para bot ${botId}`,
                );
                return;
            }

            const send = async (text: string, extra?: Record<string, any>) => {
                await this.sendMessageHttp(token, chatId, text, {
                    business_connection_id: businessConnectionId,
                    parse_mode: "Markdown",
                    ...extra,
                });
            };

            try {
                // ── list_products ─────────────────────────────────────────
                if (data === "list_products") {
                    const products = await this.prisma.product.findMany({
                        where: { isActive: true },
                        orderBy: { priceCents: "asc" },
                    });

                    if (products.length === 0) {
                        await send("😔 Nenhum produto disponível no momento.");
                        return;
                    }

                    const inlineKeyboard = products.map((p) => [
                        {
                            text: `${p.title} — R$ ${(p.priceCents / 100).toFixed(2).replace(".", ",")}`,
                            callback_data: `buy:${p.id}`,
                        },
                    ]);

                    await send("🛍️ *Escolha o produto:*", {
                        reply_markup: { inline_keyboard: inlineKeyboard },
                    });
                    return;
                }

                // ── buy:PRODUCT_ID → gera PIX ─────────────────────────────
                if (data.startsWith("buy:")) {
                    const productId = data.split(":")[1];

                    const product = await this.prisma.product.findUnique({
                        where: { id: productId },
                    });

                    if (!product) {
                        await send("❌ Produto não encontrado.");
                        return;
                    }

                    await send(`⏳ Gerando PIX para *${product.title}*\.\.\.`);

                    const pixData = await this.syncPayService.createCharge({
                        amountCents: product.priceCents,
                        productTitle: product.title,
                        referenceId: String(chatId),
                    });

                    if (!userTelegram) return;

                    // // Salvar venda
                    const sale = await this.prisma.sale.create({
                        data: {
                            botId,
                            telegramUserId: userTelegram?.telegramUserId, // mesmo valor usado no referenceId
                            productId: product.id,
                            amountCents: product.priceCents,
                            referenceId: pixData.identifier, // ID único vindo do SyncPay
                            status: "PENDING",
                            provider: "SYNCPAY",
                            rawPayload: pixData as any,
                        },
                    });

                    const price = (product.priceCents / 100)
                        .toFixed(2)
                        .replace(".", ",");

                    const pixMsg = [
                        `✅ *PIX gerado com sucesso!*`,
                        ``,
                        `🏷️ *${product.title}*`,
                        `💰 Valor: *R$ ${price}*`,
                        ``,
                        `📋 *Copia e Cola:*`,
                        `\`${pixData.pix_code}\``,
                        ``,
                        `⏰ Válido por 30 minutos`,
                        ``,
                        `Após o pagamento você receberá a confirmação automaticamente!`,
                    ].join("\n");

                    // Audio com instruçoes
                    try {
                        const instructionsAudio =
                            await this.prisma.pixAudioConfig.findFirst();

                        if (instructionsAudio) {
                            const client = this.clients.get(botId);
                            if (client) {
                                const peer = await client.getInputEntity(
                                    String(chatId),
                                );

                                // ✅ Busca buffer já convertido para ogg
                                const audioBuffer = await this.fetchFileBuffer(
                                    instructionsAudio.audioUrl,
                                    true, // forceOgg
                                );

                                // ✅ Faz upload direto com mimeType de voz
                                const uploadedFile =
                                    await this.uploadFromBuffer(
                                        client,
                                        `voice_${Date.now()}.ogg`,
                                        audioBuffer,
                                    );

                                const voiceMedia =
                                    new Api.InputMediaUploadedDocument({
                                        file: uploadedFile,
                                        mimeType: "audio/ogg",
                                        attributes: [
                                            new Api.DocumentAttributeAudio({
                                                duration: 0,
                                                voice: true, // ✅ aparece como mensagem de voz
                                            }),
                                        ],
                                    });

                                await client.invoke(
                                    new Api.messages.SendMedia({
                                        peer,
                                        media: voiceMedia,
                                        message: "",
                                        randomId: this.makeRandomId(),
                                    }),
                                );
                            }
                        }
                    } catch (error) {
                        throw new Error("[ERRO AO ENVIAR AUDIO COM INSTUÇOES]");
                    }

                    await send(pixMsg);
                    return;
                }

                // ── buy:PRODUCT_ID → gera PIX ─────────────────────────────
                if (data.startsWith("buy_discount:")) {
                    const productId = data.split(":")[1];

                    const product = await this.prisma.product.findUnique({
                        where: { id: productId },
                    });

                    if (!product) {
                        await send("❌ Produto não encontrado.");
                        return;
                    }

                    await send(`⏳ Gerando PIX para *${product.title}*\.\.\.`);

                    const discount = product.priceCents * 0.01;

                    const pixData = await this.syncPayService.createCharge({
                        amountCents: product.priceCents - discount,
                        productTitle: product.title,
                        referenceId: String(chatId),
                    });

                    // // Salvar venda
                    // const sale = await this.prisma.sale.create({
                    //     data: {

                    //     }
                    // })

                    const price = (product.priceCents / 100)
                        .toFixed(2)
                        .replace(".", ",");

                    const pixMsg = [
                        `✅ *PIX gerado com sucesso!*`,
                        ``,
                        `🏷️ *${product.title}*`,
                        `💰 Valor: *R$ ${price}*`,
                        ``,
                        `📋 *Copia e Cola:*`,
                        `\`${pixData.pix_code}\``,
                        ``,
                        `⏰ Válido por 30 minutos`,
                        ``,
                        `Após o pagamento você receberá a confirmação automaticamente!`,
                    ].join("\n");

                    // Audio com instruçoes
                    try {
                        const instructionsAudio =
                            await this.prisma.pixAudioConfig.findFirst();

                        if (instructionsAudio) {
                            const client = this.clients.get(botId);
                            if (client) {
                                const peer = await client.getInputEntity(
                                    String(chatId),
                                );

                                // ✅ Busca buffer já convertido para ogg
                                const audioBuffer = await this.fetchFileBuffer(
                                    instructionsAudio.audioUrl,
                                    true, // forceOgg
                                );

                                // ✅ Faz upload direto com mimeType de voz
                                const uploadedFile =
                                    await this.uploadFromBuffer(
                                        client,
                                        `voice_${Date.now()}.ogg`,
                                        audioBuffer,
                                    );

                                const voiceMedia =
                                    new Api.InputMediaUploadedDocument({
                                        file: uploadedFile,
                                        mimeType: "audio/ogg",
                                        attributes: [
                                            new Api.DocumentAttributeAudio({
                                                duration: 0,
                                                voice: true, // ✅ aparece como mensagem de voz
                                            }),
                                        ],
                                    });

                                await client.invoke(
                                    new Api.messages.SendMedia({
                                        peer,
                                        media: voiceMedia,
                                        message: "",
                                        randomId: this.makeRandomId(),
                                    }),
                                );
                            }
                        }
                    } catch (error) {
                        throw new Error("[ERRO AO ENVIAR AUDIO COM INSTUÇOES]");
                    }

                    await send(pixMsg);
                    return;
                }

                // ── support ───────────────────────────────────────────────
                if (data === "support") {
                    await send("🙋 Nossa equipe entrará em contato em breve!");
                    return;
                }
            } catch (err) {
                this.logger.error(
                    `Erro no callback_query handler chatId=${chatId}:`,
                    err,
                );
                await send("❌ Ocorreu um erro. Tente novamente.").catch(
                    () => {},
                );
            }
        });

        this.businessBots.set(botId, bot);

        const saved = await this.prisma.businessConnection.findMany({
            where: { botId, isEnabled: true },
        });
        for (const conn of saved) {
            this.businessConnections.set(
                `${botId}:${conn.userTelegramId}`,
                conn.connectionId,
            );
        }
    }

    getBusinessConnectionId(
        botId: string,
        userTelegramId: string,
    ): string | undefined {
        return this.businessConnections.get(`${botId}:${userTelegramId}`);
    }

    async sendBusinessMessageWithKeyboard(
        botId: string,
        businessConnectionId: string,
        recipientChatId: string | number,
        text: string,
        keyboard: string[][],
    ): Promise<void> {
        const token = this.businessBotTokens.get(botId);
        if (!token)
            throw new Error(`Token não encontrado para botId: ${botId}`);

        await this.sendMessageHttp(token, recipientChatId, text, {
            business_connection_id: businessConnectionId,
            reply_markup: {
                keyboard: keyboard.map((row) =>
                    row.map((label) => ({ text: label })),
                ),
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        });
    }

    async sendKeyboardAsBusinessUser(
        botId: string,
        ownerTelegramId: string,
        recipientChatId: string | number,
        text: string,
        keyboard: string[][],
    ): Promise<void> {
        const connectionId = this.getBusinessConnectionId(
            botId,
            ownerTelegramId,
        );
        if (!connectionId) {
            throw new Error(
                `Nenhuma business connection ativa para bot ${botId} / user ${ownerTelegramId}.`,
            );
        }
        await this.sendBusinessMessageWithKeyboard(
            botId,
            connectionId,
            recipientChatId,
            text,
            keyboard,
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // MTProto client (GramJS)
    // ─────────────────────────────────────────────────────────────────────

    private async initClient(bot: any) {
        if (this.clients.has(bot.id)) return;

        const stringSession = new StringSession(bot.session || "");
        const client = new TelegramClient(
            stringSession,
            Number(bot.apiId),
            bot.apiHash!,
            { connectionRetries: 5, retryDelay: 2000 },
        );

        await client.connect();
        this.clients.set(bot.id, client);

        if (!(await client.isUserAuthorized())) {
            this.logger.warn(
                `Client ${bot.id} não está autorizado, pulando...`,
            );
            this.clients.delete(bot.id);
            return;
        }

        client.addEventHandler(async (event: NewMessageEvent) => {
            const message = event.message;
            if (!message || message.out) return;

            const text = message.text?.toLowerCase() ?? "";
            const chatId = message.chatId?.toString();
            if (!chatId) return;

            const sender = (await message.getSender()) as any;
            const telegramUserId = sender?.id?.toString();
            const isPrivateChat = !chatId.startsWith("-");

            if (!isPrivateChat) return;

            if (telegramUserId) {
                try {
                    await this.prisma.telegramUser.upsert({
                        where: { chatId, telegramUserId },
                        update: {
                            lastSeenAt: new Date(),
                            username: sender.username || null,
                            firstName: sender.firstName || null,
                            lastName: sender.lastName || null,
                            botId: bot.id,
                        },
                        create: {
                            chatId,
                            telegramUserId,
                            botId: bot.id,
                            username: sender.username || null,
                            firstName: sender.firstName || null,
                            lastName: sender.lastName || null,
                            firstSeenAt: new Date(),
                            lastSeenAt: new Date(),
                        },
                    });
                } catch (dbErr) {
                    this.logger.error(
                        "Erro ao salvar/atualizar usuário:",
                        dbErr,
                    );
                }
            }
        }, new NewMessage({}));

        // ── Escuta cliques em botões inline enviados pelo business bot ────
        // O client user (MTProto) recebe BotCallbackQuery quando qualquer
        // usuário clica num botão inline — o business bot não recebe isso.
        client.addEventHandler(async (event: any) => {
            try {
                const className = event?.className || event?.constructor?.name;
                const data: string = event.data?.toString("utf8") ?? "";
                const chatId: string = event.query?.peer
                    ? (
                          (await client.getEntity(event.query.peer)) as any
                      )?.id?.toString()
                    : event.chatId?.toString();

                if (!chatId) return;

                this.logger.debug(`[callback] data="${data}" chatId=${chatId}`);

                // Encontra o business bot ativo para este client
                const botToken = this.businessBotTokens.get(bot.id);
                const businessConnectionId = this.getBusinessConnectionId(
                    bot.id,
                    chatId,
                );

                const sendPix = async (text: string) => {
                    if (botToken && businessConnectionId) {
                        // Responde via business bot (aparece como mensagem do dono)
                        await this.sendMessageHttp(
                            botToken,
                            parseInt(chatId),
                            text,
                            {
                                business_connection_id: businessConnectionId,
                                parse_mode: "MarkdownV2",
                            },
                        );
                    } else {
                        // Fallback: responde via client user direto
                        await client.sendMessage(chatId, {
                            message: text,
                            parseMode: "md",
                        });
                    }
                };

                const sendMarkdown = async (text: string, extra?: any) => {
                    if (botToken && businessConnectionId) {
                        await this.sendMessageHttp(
                            botToken,
                            parseInt(chatId),
                            text,
                            {
                                business_connection_id: businessConnectionId,
                                parse_mode: "Markdown",
                                ...extra,
                            },
                        );
                    } else {
                        await client.sendMessage(chatId, {
                            message: text,
                            parseMode: "md",
                        });
                    }
                };
            } catch (err) {
                this.logger.error(`Erro no callback handler:`, err);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // OTP Login Flow
    // ─────────────────────────────────────────────────────────────────────

    async sendCode(botId: string, phoneNumber: string) {
        const bot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
        });
        if (!bot?.apiId || !bot?.apiHash)
            throw new Error("API ID/Hash faltando");

        const existing = this.tempClients.get(botId);
        if (existing) {
            try {
                await existing.client.disconnect();
            } catch (_) {}
            this.tempClients.delete(botId);
        }

        const client = new TelegramClient(
            new StringSession(""),
            Number(bot.apiId),
            bot.apiHash,
            { connectionRetries: 5 },
        );

        await client.connect();
        const { phoneCodeHash } = await client.sendCode(
            { apiId: Number(bot.apiId), apiHash: bot.apiHash },
            phoneNumber,
        );

        this.tempClients.set(botId, { client, phoneCodeHash });
        return { message: "Código enviado para o Telegram" };
    }

    async verifyCode(
        botId: string,
        phoneNumber: string,
        code: string,
    ): Promise<{ success: boolean; requires2FA?: boolean; session?: string }> {
        const temp = this.tempClients.get(botId);
        if (!temp) throw new Error("Sessão expirada. Solicite um novo código.");

        const { client, phoneCodeHash } = temp;

        try {
            await client.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash: phoneCodeHash!,
                    phoneCode: code,
                }),
            );
            return await this._finalizeLogin(botId, client);
        } catch (error: any) {
            if (error.errorMessage === "SESSION_PASSWORD_NEEDED") {
                return { success: false, requires2FA: true };
            }
            throw error;
        }
    }

    async verifyPassword(
        botId: string,
        password: string,
    ): Promise<{ success: boolean; session?: string }> {
        const temp = this.tempClients.get(botId);
        if (!temp) throw new Error("Sessão expirada. Solicite um novo código.");

        try {
            await (temp.client as any).signInWithPassword(
                {
                    apiId: temp.client.apiId,
                    apiHash: (temp.client as any).apiHash,
                },
                {
                    password: async () => password,
                    onError: (err: any) => {
                        throw err;
                    },
                },
            );
            return await this._finalizeLogin(botId, temp.client);
        } catch (error: any) {
            this.logger.error("Erro no 2FA:", error);
            throw error;
        }
    }

    private async _finalizeLogin(
        botId: string,
        client: TelegramClient,
    ): Promise<{ success: true; session: string }> {
        const sessionString = client.session.save() as unknown as string;

        await this.prisma.botAccount.update({
            where: { id: botId },
            data: { session: sessionString, isActive: true },
        });

        this.tempClients.delete(botId);
        const updatedBot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
        });
        await this.initClient(updatedBot);

        return { success: true, session: sessionString };
    }

    // ─────────────────────────────────────────────────────────────────────
    // Template sender
    // ─────────────────────────────────────────────────────────────────────

    async sendTemplate(botId: string, chatId: string, template: any) {
        let client = this.clients.get(botId);

        if (!client || !client.connected) {
            const bot = await this.prisma.botAccount.findUnique({
                where: { id: botId },
            });
            if (!bot) throw new Error(`Bot not found: ${botId}`);
            await this.initClient(bot);
            client = this.clients.get(botId);
            if (!client)
                throw new Error(
                    `Failed to initialize client for bot: ${botId}`,
                );
        }

        // ── DEBUG: loga o template completo para diagnóstico ──────────────
        this.logger.debug(
            `[sendTemplate] templateId=${template.id} type=${template.type}`,
        );
        this.logger.debug(
            `[sendTemplate] mediaItems=${JSON.stringify(template.mediaItems)}`,
        );

        try {
            // ── TEXT ──────────────────────────────────────────────────────
            if (template.type === "TEXT") {
                await client.sendMessage(chatId, {
                    message: template.text || "",
                });
                return;
            }

            // ── COMBO ─────────────────────────────────────────────────────
            if (template.type === "COMBO" && template.mediaItems?.length > 0) {
                const sortedMedia = [...template.mediaItems].sort(
                    (a: any, b: any) => a.order - b.order,
                );

                if (template.text) {
                    await client.sendMessage(chatId, {
                        message: template.text,
                    });
                    await new Promise((r) => setTimeout(r, 300));
                }

                const peer = await client.getInputEntity(chatId);

                /**
                 * ✅ SOLUÇÃO CORRETA baseada no _sendAlbum oficial do GramJS:
                 *
                 * SendMultiMedia NÃO aceita InputMediaUploaded* diretamente.
                 * É obrigatório primeiro chamar messages.UploadMedia para cada item,
                 * que retorna um InputMediaPhoto/Document já processado pelo servidor.
                 * Só esse resultado pode ir no SendMultiMedia.
                 *
                 * Tipos mistos (foto + vídeo) também não são permitidos no mesmo album.
                 */
                const readyItems: ReadyItem[] = [];

                for (let i = 0; i < sortedMedia.length; i++) {
                    const item = sortedMedia[i];
                    const meta = this.getMediaMeta(item.url);
                    const filename = `file_${i}.${meta.ext}`;

                    this.logger.debug(
                        `[COMBO item ${i}] ext=${meta.ext} isVideo=${meta.isVideo} isImage=${meta.isImage}`,
                    );

                    const fileBuffer = await this.fetchFileBuffer(item.url);
                    const uploadedFile = await this.uploadFromBuffer(
                        client,
                        filename,
                        fileBuffer,
                    );
                    const uploadedMedia = this.buildInputMedia(
                        uploadedFile,
                        meta,
                        filename,
                        true,
                    );

                    // ✅ UploadMedia converte para InputMediaPhoto/Document processado pelo servidor
                    const serverMedia = await client.invoke(
                        new Api.messages.UploadMedia({
                            peer,
                            media: uploadedMedia,
                        }),
                    );

                    let finalMedia: Api.TypeInputMedia;
                    if (
                        serverMedia instanceof Api.MessageMediaPhoto &&
                        serverMedia.photo
                    ) {
                        const p = serverMedia.photo as Api.Photo;
                        finalMedia = new Api.InputMediaPhoto({
                            id: new Api.InputPhoto({
                                id: p.id,
                                accessHash: p.accessHash,
                                fileReference: p.fileReference,
                            }),
                        });
                    } else if (
                        serverMedia instanceof Api.MessageMediaDocument &&
                        serverMedia.document
                    ) {
                        const d = serverMedia.document as Api.Document;
                        finalMedia = new Api.InputMediaDocument({
                            id: new Api.InputDocument({
                                id: d.id,
                                accessHash: d.accessHash,
                                fileReference: d.fileReference,
                            }),
                        });
                    } else {
                        throw new Error(
                            `UploadMedia retornou tipo inesperado: ${serverMedia.className}`,
                        );
                    }

                    this.logger.debug(
                        `[COMBO item ${i}] UploadMedia OK -> ${finalMedia.className}`,
                    );
                    readyItems.push({
                        finalMedia,
                        isImage: meta.isImage,
                        isVideo: meta.isVideo,
                        isAudio: meta.isAudio,
                    });
                }

                // Passo 2: envia agrupando por tipo (fotos juntas, vídeo/áudio individual)
                let imageQueue: Api.InputSingleMedia[] = [];

                const flushImages = async () => {
                    if (imageQueue.length === 0) return;
                    if (imageQueue.length === 1) {
                        await client!.invoke(
                            new Api.messages.SendMedia({
                                peer,
                                media: imageQueue[0].media,
                                message: "",
                                randomId: this.makeRandomId(),
                            }),
                        );
                    } else {
                        await client!.invoke(
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
                                randomId: this.makeRandomId(),
                            }),
                        );
                    } else {
                        await flushImages();
                        await client.invoke(
                            new Api.messages.SendMedia({
                                peer,
                                media: readyItem.finalMedia,
                                message: "",
                                randomId: this.makeRandomId(),
                            }),
                        );
                        await new Promise((r) => setTimeout(r, 400));
                    }
                }

                await flushImages();
                return;
            }

            // ── Mídia única ───────────────────────────────────────────────
            const mediaUrl = template.mediaUrl || "";
            const meta = this.getMediaMeta(mediaUrl);
            const filename = `file.${meta.ext}`;

            this.logger.debug(
                `[sendTemplate] single media: url=${mediaUrl} ext=${meta.ext} mimeType=${meta.mimeType} isVideo=${meta.isVideo} isAudio=${meta.isAudio} isImage=${meta.isImage}`,
            );

            const fileBuffer = await this.fetchFileBuffer(mediaUrl);
            this.logger.debug(
                `[sendTemplate] buffer size=${fileBuffer.length}`,
            );

            if (meta.isVideo || meta.isAudio) {
                const uploadedFile = await this.uploadFromBuffer(
                    client,
                    filename,
                    fileBuffer,
                );
                const media = this.buildInputMedia(
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
                        randomId: this.makeRandomId(),
                    }),
                );
            } else {
                await client.sendFile(chatId, {
                    file: fileBuffer,
                    caption: template.text || undefined,
                    forceDocument: false,
                });
            }
        } catch (error) {
            this.logger.error(
                `Error sending template to ${chatId} via bot ${botId}:`,
                error,
            );
            throw error;
        }
    }
}
