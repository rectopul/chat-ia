import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
} from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import { CustomFile } from "telegram/client/uploads";
import { PrismaService } from "../prisma/prisma.service";
import axios from "axios";
import { Buffer } from "buffer";
import bigInt from "big-integer";
import TelegramBot from "node-telegram-bot-api";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SyncPayService } from "../syncpay/syncpay.service";
import { MessageTemplateKey } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReadyItem = {
    finalMedia: Api.TypeInputMedia;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
};

type MediaMeta = {
    ext: string;
    mimeType: string;
    isVideo: boolean;
    isAudio: boolean;
    isImage: boolean;
};

export type BotStatusItem = {
    key: string;
    label: string;
    description: string;
    ok: boolean;
    critical: boolean;
};

export type BotStatusResponse = {
    allCriticalOk: boolean;
    items: BotStatusItem[];
};

// ─────────────────────────────────────────────────────────────────────────────

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

    /**
     * Key: `${botId}:${userTelegramId}` → connectionId
     * botId é sempre o id da BotAccount com isUserAccount=true
     */
    private businessConnections: Map<string, string> = new Map();

    /**
     * Key: `${botId}:${chatId}` → connectionId
     * Registrado a cada business_message recebida.
     * Resolve o problema de chatId (cliente) ≠ userTelegramId (dono da conta).
     */
    private chatConnectionMap: Map<string, string> = new Map();

    constructor(
        private readonly prisma: PrismaService,
        private readonly syncPayService: SyncPayService,
    ) {}

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────

    async onModuleInit() {
        /**
         * ✅ CORREÇÃO CRÍTICA — causa raiz do BUSINESS_PEER_INVALID:
         *
         * A versão bugada buscava contas com isUserAccount=false numa query
         * separada para inicializar o business bot, usando um botId diferente
         * do que estava em businessConnections. Isso fazia o callback_query
         * não encontrar nenhuma connection para o chat.
         *
         * A versão correta (igual à versão antiga que funcionava):
         * busca isUserAccount=true e inicializa o business bot a partir do
         * businessBotToken da MESMA conta, garantindo que o botId seja
         * consistente em todos os mapas.
         */
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
    // Media Helpers
    // ─────────────────────────────────────────────────────────────────────

    private getMediaMeta(url: string): MediaMeta {
        const rawExt = (
            url.split(".").pop()?.split(/[#?]/)[0] ?? "jpg"
        ).toLowerCase();
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

        try {
            await new Promise<void>((resolve, reject) => {
                ffmpeg(tmpInput)
                    .audioCodec("libopus")
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .format("ogg")
                    .on("end", resolve)
                    .on("error", (err: any) => {
                        reject(
                            new Error(
                                `ffmpeg conversion failed: ${err?.message ?? JSON.stringify(err)}`,
                            ),
                        );
                    })
                    .save(tmpOutput);
            });
        } finally {
            await fs.promises.unlink(tmpInput).catch(() => {});
        }

        const outputBuffer = await fs.promises.readFile(tmpOutput);
        await fs.promises.unlink(tmpOutput).catch(() => {});

        return outputBuffer;
    }

    private async fetchFileBuffer(
        url: string,
        forceOgg = false,
    ): Promise<Buffer> {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        let buffer = Buffer.from(response.data);

        const rawExt = (
            url.split(".").pop()?.split(/[#?]/)[0] ?? ""
        ).toLowerCase();

        if (rawExt === "webp") {
            const sharp = require("sharp");
            return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        }

        const isAudioExt = ["mp3", "wav", "m4a", "aac", "flac"].includes(
            rawExt,
        );
        if (forceOgg && isAudioExt) {
            return await this.convertToOggOpus(buffer, rawExt);
        }

        return buffer;
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

    private async getAudioDuration(buffer: Buffer): Promise<number> {
        const ffmpeg = require("fluent-ffmpeg");
        return new Promise<number>((resolve, reject) => {
            const tmpPath = path.join(
                os.tmpdir(),
                `tg_probe_${Date.now()}.ogg`,
            );
            fs.writeFileSync(tmpPath, buffer);
            ffmpeg.ffprobe(tmpPath, (err: any, metadata: any) => {
                fs.unlink(tmpPath, () => {});
                if (err) return reject(err);
                resolve(Math.ceil(metadata?.format?.duration ?? 0));
            });
        });
    }

    private buildInputMedia(
        uploadedFile: Api.TypeInputFile,
        meta: MediaMeta,
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
                mimeType: "audio/ogg",
                attributes: [
                    new Api.DocumentAttributeAudio({
                        duration: 0,
                        voice: true,
                    }),
                ],
            });
        }

        return new Api.InputMediaUploadedPhoto({ file: uploadedFile });
    }

    private async prepareMedia(
        item: { url: string },
        client: TelegramClient,
        peer: Api.TypeInputPeer,
    ): Promise<ReadyItem> {
        const meta = this.getMediaMeta(item.url);
        const filename = `file_${Date.now()}.${meta.ext}`;

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

        const serverMedia = await client.invoke(
            new Api.messages.UploadMedia({ peer, media: uploadedMedia }),
        );

        let finalMedia: Api.TypeInputMedia;

        if (serverMedia instanceof Api.MessageMediaPhoto && serverMedia.photo) {
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

        return {
            finalMedia,
            isImage: meta.isImage,
            isVideo: meta.isVideo,
            isAudio: meta.isAudio,
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // PIX Audio
    // ─────────────────────────────────────────────────────────────────────

    private async sendPixAudio(
        botId: string,
        chatId: string | number,
    ): Promise<void> {
        const instructionsAudio = await this.prisma.pixAudioConfig.findFirst({
            where: { botId, isActive: true },
        });
        if (!instructionsAudio) return;

        const client = this.clients.get(botId);
        if (!client) return;

        const peer = await client.getInputEntity(String(chatId));
        const audioBuffer = await this.fetchFileBuffer(
            instructionsAudio.audioUrl,
            true,
        );
        const duration = await this.getAudioDuration(audioBuffer);
        const uploadedFile = await this.uploadFromBuffer(
            client,
            `voice_${Date.now()}.ogg`,
            audioBuffer,
        );

        const voiceMedia = new Api.InputMediaUploadedDocument({
            file: uploadedFile,
            mimeType: "audio/ogg",
            attributes: [
                new Api.DocumentAttributeAudio({ duration, voice: true }),
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

    // ─── getBusinessBotToken ──────────────────────────────────────────────────────
    // Expõe o token do business bot para o ScheduleService poder montar o contexto

    getBusinessBotToken(botId: string): string | undefined {
        return this.businessBotTokens.get(botId);
    }

    // ─── sendDontSellMenu ─────────────────────────────────────────────────────────
    // Envia o menu de desconto (ou menu padrão de produtos) após o template DONT_SELL
    // Reutiliza a lógica do scheduleDontSell mas de forma chamável externamente

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
                const discountedCents = Math.round(
                    p.priceCents * (1 - discountPercent / 100),
                );
                const originalPrice = (p.priceCents / 100)
                    .toFixed(2)
                    .replace(".", ",");
                const discountedPrice = (discountedCents / 100)
                    .toFixed(2)
                    .replace(".", ",");
                return [
                    {
                        text: `${p.title} — R$ ${originalPrice} → R$ ${discountedPrice} (-${discountPercent}%)`,
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

        await this.sendMessageHttp(token, chatId, String(messageText), {
            business_connection_id: businessConnectionId,
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: inlineKeyboard },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Substitua o método scheduleDontSell no telegram.service.ts por este.
    //
    // Em vez de um setTimeout em memória, cria ScheduledMessageJob no banco
    // para cada intervalo cadastrado. A cron job existente se encarrega do envio.
    // ─────────────────────────────────────────────────────────────────────────────

    private async scheduleDontSellJobs(
        botId: string,
        chatId: number,
        userId: number,
        businessConnectionId: string,
    ): Promise<void> {
        const dontSellTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.DONT_SELL, isActive: true },
        });

        if (!dontSellTemplate) {
            this.logger.debug(
                `[scheduleDontSellJobs] Nenhum template DONT_SELL ativo`,
            );
            return;
        }

        const user = await this.prisma.telegramUser.findUnique({
            where: { chatId: chatId.toString() },
        });

        if (!user) {
            this.logger.warn(
                `[scheduleDontSellJobs] Usuário não encontrado para chatId=${chatId}`,
            );
            return;
        }

        // Busca intervalos pelo botId — mas também tenta busca global
        // caso o botId do handler não bata com o da connection cadastrada
        let intervals = await this.prisma.dontSellInterval.findMany({
            where: { botId, isActive: true },
            orderBy: { delaySeconds: "asc" },
        });

        // Fallback: se não encontrou pelo botId, pega de qualquer bot ativo
        if (!intervals.length) {
            intervals = await this.prisma.dontSellInterval.findMany({
                where: { isActive: true },
                orderBy: { delaySeconds: "asc" },
            });
        }

        if (!intervals.length) {
            this.logger.debug(
                `[scheduleDontSellJobs] Nenhum intervalo DONT_SELL configurado`,
            );
            return;
        }

        // Valida que o botId do handler existe em BotAccount (FK constraint)
        const botAccountExists = await this.prisma.botAccount.findUnique({
            where: { id: botId },
            select: { id: true },
        });

        if (!botAccountExists) {
            this.logger.error(
                `[scheduleDontSellJobs] botId=${botId} não encontrado em BotAccount — jobs não criados`,
            );
            return;
        }

        // Sempre usa o botId do handler — é garantidamente válido (FK)
        // O businessConnectionId é salvo separadamente para o processJobs resolver
        this.logger.debug(
            `[scheduleDontSellJobs] botId=${botId} connId=${businessConnectionId}`,
        );

        let dontSellRule = await this.prisma.timedMessageRule.findFirst({
            where: { botId, templateId: dontSellTemplate.id },
        });

        if (!dontSellRule) {
            dontSellRule = await this.prisma.timedMessageRule.findFirst({
                where: { templateId: dontSellTemplate.id },
            });
        }

        if (!dontSellRule) {
            dontSellRule = await this.prisma.timedMessageRule.create({
                data: {
                    botId,
                    name: "DONT_SELL Auto",
                    templateId: dontSellTemplate.id,
                    delaySeconds: intervals[0].delaySeconds,
                    segment: "NON_BUYERS",
                    isActive: true,
                },
            });
        }

        const now = new Date();
        const jobsToCreate = intervals.map((interval) => ({
            botId, // ← sempre o botId do handler (FK válida)
            telegramUserId: user.telegramUserId,
            chatId: chatId.toString(),
            templateId: dontSellTemplate.id,
            ruleId: dontSellRule!.id,
            runAt: new Date(now.getTime() + interval.delaySeconds * 1000),
            status: "PENDING" as const,
        }));

        await this.prisma.scheduledMessageJob.createMany({
            data: jobsToCreate,
            skipDuplicates: true,
        });

        this.logger.log(
            `[scheduleDontSellJobs] ${jobsToCreate.length} jobs agendados para chatId=${chatId} ` +
                `(botId=${botId}): ${intervals.map((i) => `T+${i.delaySeconds}s`).join(", ")}`,
        );
    }

    async confirmPayment(saleId: string): Promise<void> {
        const sale = await this.prisma.sale.findUnique({
            where: { id: saleId },
            include: { product: true, user: true },
        });

        if (!sale) throw new Error(`Venda não encontrada: ${saleId}`);

        if (!sale.product.description) {
            throw new Error(
                `Produto "${sale.product.title}" não tem descrição/link configurado`,
            );
        }

        const token = this.businessBotTokens.get(sale.botId);
        if (!token) {
            throw new Error(
                `Token do business bot não encontrado para botId: ${sale.botId}`,
            );
        }

        const businessConnectionId = await this.resolveConnectionForChat(
            sale.botId,
            sale.user.chatId,
        );

        if (!businessConnectionId) {
            throw new Error(
                `Business connection não encontrada para chatId: ${sale.user.chatId}`,
            );
        }

        // Usa parse_mode: null — URLs e conteúdo de usuário não precisam
        // de Markdown e podem conter caracteres que quebram o parser
        const message = [
            `✅ Pagamento confirmado! Obrigado pela compra!`,
            ``,
            `🏷️ ${sale.product.title}`,
            ``,
            `📦 Seu acesso:`,
            sale.product.description,
            ``,
            `Qualquer dúvida é só chamar aqui. 💬`,
        ].join("\n");

        await this.sendMessageHttp(token, sale.user.chatId, message, {
            business_connection_id: businessConnectionId,
            // sem parse_mode — evita falha com URLs e caracteres especiais na descrição
        });

        this.logger.log(
            `[confirmPayment] Conteúdo enviado para chatId=${sale.user.chatId} (saleId=${saleId})`,
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // PIX message builder
    // ─────────────────────────────────────────────────────────────────────

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
            `\`${pixCode}\``,
            ``,
            `Seu PIX tá aqui — Clica para copiar, paga e me avisa.`,
        ].join("\n");
    }

    // ─────────────────────────────────────────────────────────────────────
    // HTTP helper para Business Bot API
    // ─────────────────────────────────────────────────────────────────────

    /**
     * ✅ CORREÇÃO: reply_markup extraído do extra antes do spread,
     * evitando double-serialize que causava Bad Request 400.
     */
    private async sendMessageHttp(
        token: string,
        chatId: number | string,
        text: string,
        extra?: Record<string, any>,
    ): Promise<any> {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        const { reply_markup, ...restExtra } = extra ?? {};

        const payload: Record<string, any> = {
            chat_id: chatId,
            text,
            ...restExtra,
        };

        if (reply_markup) {
            payload.reply_markup =
                typeof reply_markup === "string"
                    ? reply_markup
                    : JSON.stringify(reply_markup);
        }

        this.logger.debug("sendMessage payload: " + JSON.stringify(payload));
        const { data } = await axios.post(url, payload);
        if (!data.ok)
            throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
        return data.result;
    }

    private async answerCallbackQuery(
        token: string,
        queryId: string,
    ): Promise<void> {
        try {
            await axios.post(
                `https://api.telegram.org/bot${token}/answerCallbackQuery`,
                { callback_query_id: queryId },
            );
        } catch (_) {}
    }

    private async send(
        text: string,
        token: string,
        chatId: string | number,
        businessConnectionId: string,
        extra?: Record<string, any>,
    ) {
        await this.sendMessageHttp(token, chatId, text, {
            business_connection_id: businessConnectionId,
            parse_mode: "Markdown",
            ...extra,
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Business Connection helpers
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Resolve connectionId pelo chatId da conversa.
     * Prioridade: (1) chatConnectionMap, (2) businessConnections, (3) banco.
     */
    private async resolveConnectionForChat(
        botId: string,
        chatId: string | number,
    ): Promise<string | undefined> {
        const fromChat = this.chatConnectionMap.get(`${botId}:${chatId}`);
        if (fromChat) return fromChat;

        const fromOwner = this.businessConnections.get(`${botId}:${chatId}`);
        if (fromOwner) return fromOwner;

        const conn = await this.prisma.businessConnection.findFirst({
            where: { botId, isEnabled: true },
        });
        return conn?.connectionId;
    }

    getBusinessConnectionId(
        botId: string,
        userTelegramId: string,
    ): string | undefined {
        return this.businessConnections.get(`${botId}:${userTelegramId}`);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Business Bot — inicialização
    // ─────────────────────────────────────────────────────────────────────

    async initBusinessBot(botId: string, token: string): Promise<void> {
        if (this.businessBots.has(botId)) {
            this.logger.warn(`Business bot ${botId} já ativo, reiniciando...`);
            try {
                await this.businessBots.get(botId)!.stopPolling();
                await new Promise((r) => setTimeout(r, 2000));
            } catch (_) {}
            this.businessBots.delete(botId);
        }

        try {
            await axios.post(
                `https://api.telegram.org/bot${token}/getUpdates`,
                {
                    timeout: 0,
                    offset: -1,
                },
            );
        } catch (_) {}

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

        this.registerBusinessConnectionHandler(bot, botId);
        this.registerBusinessMessageHandler(bot, botId, token);
        this.registerCallbackQueryHandler(bot, botId, token);

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

        this.logger.log(
            `[initBusinessBot] ${saved.length} connections carregadas para bot ${botId}`,
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Business Bot — handlers
    // ─────────────────────────────────────────────────────────────────────

    private registerBusinessConnectionHandler(bot: TelegramBot, botId: string) {
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

            await this.prisma.businessConnection.upsert({
                where: { connectionId },
                create: {
                    connectionId,
                    botId,
                    userTelegramId: String(user.id),
                    isEnabled: true,
                },
                update: {
                    isEnabled: true,
                    botId,
                    userTelegramId: String(user.id),
                },
            });
        });
    }

    private registerBusinessMessageHandler(
        bot: TelegramBot,
        botId: string,
        token: string,
    ) {
        bot.on("business_message" as any, async (msg: any) => {
            // ── DEBUG COMPLETO — remover após diagnóstico ─────────────────
            this.logger.debug(
                `[business_message RAW] ${JSON.stringify({
                    message_id: msg.message_id,
                    text: msg.text,
                    business_connection_id: msg.business_connection_id,
                    from: msg.from,
                    chat: msg.chat,
                })}`,
            );
            // ─────────────────────────────────────────────────────────────

            const text: string = (msg.text ?? "").toLowerCase().trim();
            const chatId: number = msg.chat.id;
            const userId: number = msg.from?.id;
            const businessConnectionId: string | undefined =
                msg.business_connection_id;

            if (msg.from?.is_bot) return;
            if (!businessConnectionId) return;

            // Busca o dono da connection no banco para filtrar corretamente
            const ownerConn = await this.prisma.businessConnection.findFirst({
                where: { connectionId: businessConnectionId, isEnabled: true },
            });
            const ownerTelegramId = ownerConn?.userTelegramId;

            // Se quem enviou é o próprio dono da connection, ignora —
            // responder neste evento causa BUSINESS_PEER_INVALID
            if (ownerTelegramId && String(userId) === ownerTelegramId) {
                this.logger.debug(
                    `[business_message] ignorando mensagem do dono (userId=${userId})`,
                );
                return;
            }

            // ✅ Registra chatId → connectionId para o callback_query resolver corretamente
            this.chatConnectionMap.set(
                `${botId}:${chatId}`,
                businessConnectionId,
            );

            this.logger.debug(
                `[business_message] chatId=${chatId} userId=${userId} connId=${businessConnectionId}`,
            );

            // Verifica se é um usuário novo ANTES do upsert
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

                await this.sendMessageHttp(token, chatId, message, {
                    business_connection_id: businessConnectionId,
                    parse_mode: "Markdown",
                    reply_markup: { inline_keyboard },
                });
            };

            const isGreeting =
                text === "/start" ||
                text === "oi" ||
                text === "olá" ||
                text === "ola" ||
                text === "oii" ||
                text === "oiii" ||
                text === "bom dia" ||
                text === "boa tarde" ||
                text === "boa noite" ||
                text === "menu" ||
                text === "início" ||
                text === "inicio" ||
                text === "oi!" ||
                text === "olá!" ||
                text === "ae" ||
                text === "eae" ||
                text === "e aí" ||
                text === "eai";

            if (isGreeting) {
                if (isNewUser) {
                    // Novo usuário — fire-and-forget para não bloquear o handler.
                    // O handleGreeting tem await delay() internamente e pode levar
                    // minutos — se rodar com await trava o polling inteiro do bot.
                    this.logger.debug(
                        `[business_message] novo usuário chatId=${chatId}, iniciando fluxo completo`,
                    );
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
                    // Usuário existente — agenda DONT_SELL se não comprou
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
                        this.scheduleDontSellJobs(
                            botId,
                            chatId,
                            userId,
                            businessConnectionId!,
                        ).catch((err) =>
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
                await this.sendMessageHttp(
                    token,
                    chatId,
                    "🙋 Nossa equipe entrará em contato em breve!",
                    { business_connection_id: businessConnectionId },
                ).catch((err) =>
                    this.logger.error(`Erro ao enviar suporte:`, err),
                );
            }
        });
    }

    private async handleGreeting(
        botId: string,
        chatId: number,
        token: string,
        businessConnectionId: string,
        userId: number,
        delay: (ms: number) => Promise<unknown>,
        sendMenu: (message: string, buttons: any[][]) => Promise<void>,
    ) {
        // ✅ Contexto business — todos os envios devem ir pela Bot API,
        // nunca pelo MTProto, para evitar BUSINESS_PEER_INVALID
        const businessCtx = { token, businessConnectionId, botId };

        const welcomeTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.WELCOME },
            include: { mediaItems: true },
        });
        if (welcomeTemplate) {
            await this.sendTemplate(
                botId,
                chatId.toString(),
                welcomeTemplate,
                businessCtx,
            );
        }

        const timedTemplates = await this.prisma.timedMessageRule.findMany({
            where: {
                botId,
                // Exclui a regra auto-gerada pelo scheduleDontSellJobs —
                // ela é usada apenas como referência na fila, não deve
                // aparecer no fluxo de boas-vindas
                name: { not: "DONT_SELL Auto" },
            },
            include: { template: { include: { mediaItems: true } } },
            orderBy: { delaySeconds: "asc" },
        });

        // Usa tempo de parede (wall clock) desde o início do greeting para
        // calcular o delay preciso de cada template, descontando o tempo
        // que o sendTemplate anterior levou (upload de vídeo, conversão de áudio etc.)
        const greetingStart = Date.now();

        for (const timedTemplate of timedTemplates) {
            const templateId = timedTemplate.template?.id;

            // Calcula quanto falta para o momento alvo baseado no clock real
            // Ex: template deve ir em T+10s, já passaram 3s enviando o anterior → espera 7s
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
                await this.sendTemplate(
                    botId,
                    chatId.toString(),
                    timedTemplate.template,
                    businessCtx,
                );
            } catch (err: any) {
                this.logger.error(
                    `[handleGreeting] Erro ao enviar timed template ${templateId} ` +
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

        const send = async (text: string, extra?: Record<string, any>) =>
            this.sendMessageHttp(token, chatId, text, {
                business_connection_id: businessConnectionId,
                parse_mode: "Markdown",
                ...extra,
            });

        try {
            const products = await this.prisma.product.findMany({
                where: { isActive: true },
                orderBy: { priceCents: "asc" },
            });

            if (!products.length) {
                await sendMenu("😔 Nenhum produto disponível no momento.", []);
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
        } catch (err: any) {
            this.logger.error(
                `[handleGreeting] Erro ao enviar sendMenu para ${chatId}: ${err?.message ?? err}`,
            );
            if (err?.errors) {
                this.logger.error(
                    `[handleGreeting] sendMenu AggregateError details:`,
                    err.errors,
                );
            }
        }

        this.scheduleDontSellJobs(botId, chatId, userId, businessConnectionId);
    }

    private scheduleDontSell(
        botId: string,
        chatId: number,
        token: string,
        userId: number,
        businessConnectionId: string,
        delay: (ms: number) => Promise<unknown>,
    ) {
        const DONT_SELL_DELAY = 4 * 60 * 1000;

        (async () => {
            try {
                await delay(DONT_SELL_DELAY);

                const hasPurchased = await this.prisma.sale.findFirst({
                    where: {
                        telegramUserId: userId.toString(),
                        createdAt: {
                            gte: new Date(Date.now() - DONT_SELL_DELAY),
                        },
                    },
                });
                if (hasPurchased) return;

                const dontsellTemplate =
                    await this.prisma.messageTemplate.findFirst({
                        where: { key: MessageTemplateKey.DONT_SELL },
                        include: { mediaItems: true },
                    });
                if (dontsellTemplate) {
                    await this.sendTemplate(
                        botId,
                        chatId.toString(),
                        dontsellTemplate,
                        {
                            token,
                            businessConnectionId,
                            botId,
                        },
                    );
                }

                const connStillValid =
                    await this.prisma.businessConnection.findFirst({
                        where: {
                            connectionId: businessConnectionId,
                            isEnabled: true,
                        },
                    });
                if (!connStillValid) {
                    this.logger.warn(
                        `[scheduleDontSell] connection ${businessConnectionId} não está mais ativa`,
                    );
                    return;
                }

                const discountConfig =
                    await this.prisma.discountConfig.findUnique({
                        where: { botId },
                        include: { product: true },
                    });

                // Busca produtos: se há desconto ativo usa o produto do desconto,
                // senão lista todos os produtos ativos
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
                        const discountedCents = Math.round(
                            p.priceCents * (1 - discountPercent / 100),
                        );
                        const originalPrice = (p.priceCents / 100)
                            .toFixed(2)
                            .replace(".", ",");
                        const discountedPrice = (discountedCents / 100)
                            .toFixed(2)
                            .replace(".", ",");
                        return [
                            {
                                text: `${p.title} — R$ ${originalPrice} → R$ ${discountedPrice} (-${discountPercent}%)`,
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

                // Texto da mensagem: usa discountText se configurado, senão mensagem padrão
                const messageText = hasDiscount
                    ? discountConfig.discountText
                    : "🛍️ *Que tal aproveitar e garantir agora?* Escolha um produto:";

                await this.send(
                    String(messageText),
                    token,
                    chatId.toString(),
                    businessConnectionId,
                    { reply_markup: { inline_keyboard: inlineKeyboard } },
                );
            } catch (err) {
                this.logger.error(
                    `Erro no DONT_SELL para chatId=${chatId}:`,
                    err,
                );
            }
        })();
    }

    private registerCallbackQueryHandler(
        bot: TelegramBot,
        botId: string,
        token: string,
    ) {
        bot.on("callback_query" as any, async (query: any) => {
            const data: string = query.data ?? "";
            const chatId: number = query.message?.chat?.id ?? query.from?.id;
            const queryId: string = query.id;

            await this.answerCallbackQuery(token, queryId);

            // ✅ Resolve pelo chatId — não pela primeira connection genérica do bot
            const businessConnectionId = await this.resolveConnectionForChat(
                botId,
                chatId,
            );

            if (!businessConnectionId) {
                this.logger.error(
                    `[callback_query] Nenhuma connection encontrada para chatId=${chatId} bot=${botId}`,
                );
                return;
            }

            const send = async (text: string, extra?: Record<string, any>) =>
                this.sendMessageHttp(token, chatId, text, {
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
                    `Erro no callback_query handler chatId=${chatId}:`,
                    err,
                );
                await send("❌ Ocorreu um erro. Tente novamente.").catch(
                    () => {},
                );
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Callback handlers
    // ─────────────────────────────────────────────────────────────────────

    private async handleListProducts(
        send: (text: string, extra?: any) => Promise<any>,
    ) {
        const products = await this.prisma.product.findMany({
            where: { isActive: true },
            orderBy: { priceCents: "asc" },
        });

        if (!products.length) {
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
    }

    private async handleBuy(
        data: string,
        chatId: number,
        botId: string,
        token: string,
        userTelegram: any,
        send: (text: string, extra?: any) => Promise<any>,
    ) {
        const productId = data.split(":")[1];
        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            await send("❌ Produto não encontrado.");
            return;
        }
        if (!userTelegram) {
            await send("❌ Usuário não encontrado.");
            return;
        }

        await send(`Só um minutinho que já estou gerando seu pix tá`);

        const pixData = await this.syncPayService.createCharge({
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

        await this.sendPixAudio(botId, chatId).catch((err) =>
            this.logger.error(`Erro ao enviar áudio PIX:`, err),
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
    ) {
        const [, productId, percentStr] = data.split(":");
        const discountPercent = percentStr ? parseInt(percentStr) : 10;

        const product = await this.prisma.product.findUnique({
            where: { id: productId },
        });

        if (!product) {
            await send("❌ Produto não encontrado.");
            return;
        }
        if (!userTelegram) {
            await send("❌ Usuário não encontrado.");
            return;
        }

        await send(`⏳ Gerando PIX para *${product.title}*...`);

        const finalAmountCents = Math.round(
            product.priceCents * (1 - discountPercent / 100),
        );

        const pixData = await this.syncPayService.createCharge({
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

        await this.sendPixAudio(botId, chatId).catch((err) =>
            this.logger.error(`Erro ao enviar áudio PIX:`, err),
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

    // ─────────────────────────────────────────────────────────────────────
    // Public API helpers
    // ─────────────────────────────────────────────────────────────────────

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
    // Bot Status Checklist
    // ─────────────────────────────────────────────────────────────────────

    async getBotStatus(): Promise<BotStatusResponse> {
        const items: BotStatusItem[] = [];

        const botAccount = await this.prisma.botAccount.findFirst({
            where: {
                isUserAccount: true,
                isActive: true,
                session: { not: null },
            },
        });

        items.push({
            key: "bot_account",
            label: "Conta MTProto conectada",
            description:
                "Autentique uma conta em Configurações → Bot (API ID + API Hash + OTP).",
            ok: !!botAccount,
            critical: true,
        });

        items.push({
            key: "business_bot_token",
            label: "Token do Business Bot configurado",
            description:
                "Configure o token do @BotFather em Configurações → Bot.",
            ok: !!botAccount?.businessBotToken,
            critical: true,
        });

        items.push({
            key: "business_bot_running",
            label: "Business Bot ativo e conectado",
            description:
                "O bot não está rodando. Verifique o token e reinicie.",
            ok: botAccount ? this.businessBots.has(botAccount.id) : false,
            critical: true,
        });

        const businessConn = botAccount
            ? await this.prisma.businessConnection.findFirst({
                  where: { botId: botAccount.id, isEnabled: true },
              })
            : null;

        items.push({
            key: "business_connection",
            label: "Business Connection ativa",
            description:
                "Conecte o bot em: Telegram → Configurações → Telegram Business → Chatbots.",
            ok: !!businessConn,
            critical: true,
        });

        const welcomeTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.WELCOME },
        });

        items.push({
            key: "welcome_template",
            label: 'Template "WELCOME" cadastrado',
            description:
                'Crie um template com a chave "WELCOME" em Templates → Novo Template.',
            ok: !!welcomeTemplate,
            critical: true,
        });

        const productCount = await this.prisma.product.count({
            where: { isActive: true },
        });

        items.push({
            key: "active_product",
            label: "Pelo menos 1 produto ativo",
            description: "Cadastre um produto em Produtos → Novo Produto.",
            ok: productCount > 0,
            critical: true,
        });

        items.push({
            key: "syncpay",
            label: "Integração de pagamento (SyncPay) configurada",
            description:
                "Defina SYNCPAY_API_KEY e SYNCPAY_TOKEN nas variáveis de ambiente.",
            ok: !!process.env.SYNCPAY_API_KEY || !!process.env.SYNCPAY_TOKEN,
            critical: true,
        });

        const dontSellTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.DONT_SELL },
        });

        items.push({
            key: "dont_sell_template",
            label: 'Template "DONT_SELL" cadastrado (opcional)',
            description:
                'Enviado 4 min após o primeiro contato sem compra. Chave: "DONT_SELL".',
            ok: !!dontSellTemplate,
            critical: false,
        });

        const discountConfig = botAccount
            ? await this.prisma.discountConfig.findUnique({
                  where: { botId: botAccount.id },
              })
            : null;

        items.push({
            key: "discount_config",
            label: "Desconto automático configurado (opcional)",
            description: "Configure em Configurações → Desconto.",
            ok: !!discountConfig?.isActive,
            critical: false,
        });

        const pixAudio = botAccount
            ? await this.prisma.pixAudioConfig.findFirst({
                  where: { botId: botAccount.id, isActive: true },
              })
            : null;

        items.push({
            key: "pix_audio",
            label: "Áudio de instruções PIX (opcional)",
            description: "Adicione em Configurações → Áudio PIX.",
            ok: !!pixAudio,
            critical: false,
        });

        return {
            allCriticalOk: items.filter((i) => i.critical).every((i) => i.ok),
            items,
        };
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

        try {
            await temp.client.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash: temp.phoneCodeHash!,
                    phoneCode: code,
                }),
            );
            return await this._finalizeLogin(botId, temp.client);
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
    // MTProto client (GramJS)
    // ─────────────────────────────────────────────────────────────────────

    private async initClient(bot: any) {
        if (this.clients.has(bot.id)) return;

        const client = new TelegramClient(
            new StringSession(bot.session || ""),
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

        // Mantém a conexão viva com keep-alive implícito do GramJS
        // Se desconectar, tenta reconectar automaticamente
        client.addEventHandler(async (event: NewMessageEvent) => {
            const message = event.message;
            if (!message || message.out) return;

            const chatId = message.chatId?.toString();
            if (!chatId || chatId.startsWith("-")) return;

            const sender = (await message.getSender()) as any;
            const telegramUserId = sender?.id?.toString();
            if (!telegramUserId) return;

            try {
                await this.prisma.telegramUser.upsert({
                    where: { chatId },
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
                this.logger.error("Erro ao salvar/atualizar usuário:", dbErr);
            }
        }, new NewMessage({}));
    }

    // ─────────────────────────────────────────────────────────────────────
    // Template sender
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Envia um template para o chatId.
     *
     * @param businessCtx  Quando chamado a partir de um contexto business (business_message),
     *                     passe { token, businessConnectionId } para que o envio seja feito
     *                     inteiramente via Bot API. Sem isso, o MTProto é usado — o que causa
     *                     BUSINESS_PEER_INVALID se misturado com a Bot API na mesma conversa.
     */
    async sendTemplate(
        botId: string,
        chatId: string,
        template: any,
        businessCtx?: {
            token: string;
            businessConnectionId: string;
            botId: string;
        },
    ) {
        this.logger.debug(
            `[sendTemplate] id=${template.id} type=${template.type} business=${!!businessCtx}`,
        );

        // ── Envio via Bot API (contexto business) ────────────────────────
        if (businessCtx) {
            await this.sendTemplateViaBotApi(chatId, template, businessCtx);
            return;
        }

        // ── Envio via MTProto (contexto normal) ──────────────────────────
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

    /**
     * Envia template inteiramente via Bot API HTTP, obrigatório em contexto business.
     * Texto → sendMessage, imagem → sendPhoto, vídeo → sendVideo, áudio → sendAudio,
     * COMBO → sequência de chamadas individuais.
     */
    /**
     * Envia template via Bot API HTTP (obrigatório em contexto business).
     *
     * Regras de agrupamento:
     * - Fotos  → agrupadas em sendMediaGroup (até 10 por grupo), SEMPRE PRIMEIRO
     * - Vídeos → agrupados em sendMediaGroup separado (após as fotos)
     * - Áudios → sendVoice individualmente (ogg opus, aparece como nota de voz)
     * - Texto  → sendMessage
     *
     * A Bot API aceita URLs públicas diretamente — não precisa fazer upload.
     */
    /**
     * Persiste o file_id retornado pelo Telegram no banco para reutilização futura.
     * Na próxima vez que o template for enviado, o arquivo é enviado instantaneamente
     * sem nenhum upload — o Telegram serve direto do servidor deles.
     */
    private async saveFileId(
        itemId: string,
        isTemplateMedia: boolean,
        fileId: string,
    ): Promise<void> {
        try {
            if (isTemplateMedia) {
                await this.prisma.messageTemplateMedia.update({
                    where: { id: itemId },
                    data: { telegramFileId: fileId },
                });
            } else {
                await this.prisma.messageTemplate.update({
                    where: { id: itemId },
                    data: { telegramFileId: fileId },
                });
            }
            this.logger.debug(
                `[saveFileId] file_id salvo para ${itemId}: ${fileId.slice(0, 40)}...`,
            );
        } catch (err: any) {
            // Não crítico — apenas loga se falhar
            this.logger.warn(
                `[saveFileId] Falha ao salvar file_id para ${itemId}: ${err?.message}`,
            );
        }
    }

    private async sendTemplateViaBotApi(
        chatId: string,
        template: any,
        ctx: { token: string; businessConnectionId: string; botId: string },
    ) {
        const base = { business_connection_id: ctx.businessConnectionId };

        // ── Helpers ──────────────────────────────────────────────────────

        const sendText = async (text: string) => {
            if (!text?.trim()) return;
            await this.sendMessageHttp(ctx.token, chatId, text, base);
        };

        /**
         * Envia fotos agrupadas via sendMediaGroup.
         * Usa file_id se disponível (instantâneo), senão URL direta.
         * Salva o file_id retornado para as próximas chamadas.
         */
        const sendPhotoGroup = async (
            items: { url: string; fileId?: string; itemId?: string }[],
        ) => {
            if (!items.length) return;

            for (let i = 0; i < items.length; i += 10) {
                const chunk = items.slice(i, i + 10);
                const mediaJson = chunk.map((item) => ({
                    type: "photo",
                    // file_id tem prioridade — instantâneo e sem consumo de banda
                    media: item.fileId ?? item.url,
                }));

                const { data } = await axios.post(
                    `https://api.telegram.org/bot${ctx.token}/sendMediaGroup`,
                    {
                        chat_id: chatId,
                        media: JSON.stringify(mediaJson),
                        ...base,
                    },
                );

                if (!data.ok)
                    throw new Error(
                        `sendPhotoGroup error: ${JSON.stringify(data)}`,
                    );

                // Salva file_id dos itens que ainda não têm
                if (Array.isArray(data.result)) {
                    for (let j = 0; j < data.result.length; j++) {
                        const msg = data.result[j];
                        const item = chunk[j];
                        if (item?.itemId && !item.fileId) {
                            // Pega o maior tamanho disponível da foto
                            const photos = msg?.photo;
                            const bestPhoto = Array.isArray(photos)
                                ? photos[photos.length - 1]
                                : null;
                            if (bestPhoto?.file_id) {
                                await this.saveFileId(
                                    item.itemId,
                                    true,
                                    bestPhoto.file_id,
                                );
                                item.fileId = bestPhoto.file_id; // atualiza em memória
                            }
                        }
                    }
                }

                if (items.length > 10)
                    await new Promise((r) => setTimeout(r, 500));
            }
        };

        /**
         * Envia vídeos via MTProto (GramJS) diretamente para o chat do cliente.
         * Usa file_id se disponível — evita re-upload via MTProto (muito mais rápido).
         * Na primeira vez sobe via MTProto e salva o file_id para as próximas.
         */
        const sendVideos = async (
            items: { url: string; fileId?: string; itemId?: string }[],
        ) => {
            // Vídeos que já têm file_id: envia direto via Bot API (instantâneo)
            const withFileId = items.filter((i) => i.fileId);
            const withoutFileId = items.filter((i) => !i.fileId);

            for (const item of withFileId) {
                const { data } = await axios.post(
                    `https://api.telegram.org/bot${ctx.token}/sendVideo`,
                    {
                        chat_id: chatId,
                        video: item.fileId,
                        supports_streaming: true,
                        ...base,
                    },
                );
                if (!data.ok) {
                    this.logger.warn(
                        `[sendVideos] file_id inválido para ${item.itemId}, tentando re-upload`,
                    );
                    withoutFileId.push({ ...item, fileId: undefined });
                } else {
                    this.logger.debug(
                        `[sendVideos] Enviado via file_id (instantâneo): ${item.itemId}`,
                    );
                }
                await new Promise((r) => setTimeout(r, 300));
            }

            if (!withoutFileId.length) return;

            // Vídeos sem file_id: sobe via MTProto e salva o file_id
            let client = this.clients.get(ctx.botId);
            if (!client)
                throw new Error(
                    `MTProto client não encontrado para bot ${ctx.botId}`,
                );

            if (!client.connected) {
                this.logger.warn(
                    `[sendVideos] Client desconectado, reconectando...`,
                );
                await Promise.race([
                    client.connect(),
                    new Promise((_, reject) =>
                        setTimeout(
                            () =>
                                reject(
                                    new Error("Timeout ao reconectar MTProto"),
                                ),
                            15000,
                        ),
                    ),
                ]);
            }

            const peer = new Api.InputPeerUser({
                userId: bigInt(chatId.toString()),
                accessHash: bigInt(0),
            });

            for (const item of withoutFileId) {
                const url = item.url;
                const meta = this.getMediaMeta(url);
                const filename = `video_${Date.now()}.${meta.ext}`;
                const buf = await this.fetchFileBuffer(url);
                const uploadedFile = await this.uploadFromBuffer(
                    client,
                    filename,
                    buf,
                );

                const inputMedia = new Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: meta.mimeType,
                    attributes: [
                        new Api.DocumentAttributeVideo({
                            duration: 0,
                            w: 1280,
                            h: 720,
                            supportsStreaming: true,
                            roundMessage: false,
                        }),
                        new Api.DocumentAttributeFilename({
                            fileName: filename,
                        }),
                    ],
                });

                // Faz upload para o servidor — sem timeout artificial, o GramJS
                // tem retry interno e o upload pode demorar para vídeos grandes
                const serverMedia = (await client.invoke(
                    new Api.messages.UploadMedia({ peer, media: inputMedia }),
                )) as Api.TypeMessageMedia;

                if (
                    !(serverMedia instanceof Api.MessageMediaDocument) ||
                    !serverMedia.document
                ) {
                    const className =
                        (serverMedia as any)?.className ?? "unknown";
                    throw new Error(
                        `UploadMedia vídeo retornou tipo inesperado: ${className}`,
                    );
                }

                const d = serverMedia.document as Api.Document;

                // Envia direto para o chat do cliente via MTProto
                const sentMsg = (await client.invoke(
                    new Api.messages.SendMedia({
                        peer,
                        media: new Api.InputMediaDocument({
                            id: new Api.InputDocument({
                                id: d.id,
                                accessHash: d.accessHash,
                                fileReference: d.fileReference,
                            }),
                        }),
                        message: "",
                        randomId: this.makeRandomId(),
                    }),
                )) as any;

                // Salva o file_id retornado para reutilização futura
                // O MTProto retorna Updates com a mensagem enviada
                if (item.itemId) {
                    try {
                        const updates =
                            sentMsg?.updates ?? sentMsg?.Updates ?? [];
                        const sentMessage = Array.isArray(updates)
                            ? updates.find(
                                  (u: any) => u?.message?.media?.document,
                              )
                            : null;
                        const fileId =
                            sentMessage?.message?.media?.document?.id?.toString();
                        if (fileId) {
                            await this.saveFileId(item.itemId, true, fileId);
                        }
                    } catch (_) {
                        /* não crítico */
                    }
                }

                await new Promise((r) => setTimeout(r, 500));
            }
        };

        /**
         * Converte qualquer áudio para ogg opus e envia como nota de voz nativa.
         * Usa file_id se disponível (instantâneo), senão converte e faz upload.
         */
        const sendAudio = async (item: {
            url: string;
            fileId?: string;
            itemId?: string;
        }) => {
            const url = item.url;
            const rawExt = (
                url.split(".").pop()?.split(/[#?]/)[0] ?? "mp3"
            ).toLowerCase();
            const FormData = require("form-data");

            // Se já tem file_id — envia instantaneamente sem upload
            if (item.fileId) {
                this.logger.debug(
                    `[sendAudio] Enviando via file_id (instantâneo): ${item.itemId}`,
                );
                const { data } = await axios.post(
                    `https://api.telegram.org/bot${ctx.token}/sendVoice`,
                    { chat_id: chatId, voice: item.fileId, ...base },
                );
                if (data.ok) return;
                // Se o file_id falhou (expirou), continua para re-upload
                this.logger.warn(
                    `[sendAudio] file_id inválido, re-enviando via upload`,
                );
            }

            // Sem file_id — converte e faz upload
            let audioBuffer: Buffer;
            let filename: string;
            let contentType: string;
            let method: "sendVoice" | "sendAudio";

            try {
                const rawBuffer = await this.fetchFileBuffer(url);
                audioBuffer = await this.convertToOggOpus(rawBuffer, rawExt);
                filename = `voice_${Date.now()}.ogg`;
                contentType = "audio/ogg";
                method = "sendVoice";
                this.logger.debug(
                    `[sendAudio] Convertido para OGG opus, enviando como voice note`,
                );
            } catch (convErr: any) {
                this.logger.warn(
                    `[sendAudio] Conversão OGG falhou (${convErr?.message}), usando sendAudio`,
                );
                audioBuffer = await this.fetchFileBuffer(url);
                filename = `audio_${Date.now()}.${rawExt}`;
                contentType =
                    rawExt === "mp3" ? "audio/mpeg" : `audio/${rawExt}`;
                method = "sendAudio";
            }

            const form = new FormData();
            form.append("chat_id", chatId);
            form.append("business_connection_id", ctx.businessConnectionId);
            const fieldName = method === "sendVoice" ? "voice" : "audio";
            form.append(fieldName, audioBuffer, { filename, contentType });

            const { data } = await axios.post(
                `https://api.telegram.org/bot${ctx.token}/${method}`,
                form,
                { headers: form.getHeaders() },
            );

            if (!data.ok)
                throw new Error(`${method} error: ${JSON.stringify(data)}`);

            // Salva file_id para as próximas chamadas
            if (item.itemId) {
                const fileId =
                    data.result?.voice?.file_id ?? data.result?.audio?.file_id;
                if (fileId) await this.saveFileId(item.itemId, true, fileId);
            }
        };

        // ── TEXT ─────────────────────────────────────────────────────────
        if (template.type === "TEXT") {
            await sendText(template.text || "");
            return;
        }

        // ── Mídia única (IMAGE, VIDEO, AUDIO) ────────────────────────────
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

            const meta = this.getMediaMeta(url);
            this.logger.debug(
                `[sendTemplateViaBotApi] single media ` +
                    `isAudio=${meta.isAudio} isVideo=${meta.isVideo} ` +
                    `hasFileId=${!!fileId}`,
            );

            if (meta.isAudio) {
                await sendAudio({ url, fileId, itemId });
            } else if (meta.isVideo) {
                await sendVideos([{ url, fileId, itemId }]);
            } else {
                await sendPhotoGroup([{ url, fileId, itemId }]);
            }
            return;
        }

        // ── COMBO ─────────────────────────────────────────────────────────
        if (template.mediaItems?.length > 0) {
            const sorted = [...template.mediaItems].sort(
                (a: any, b: any) => a.order - b.order,
            );

            // Separa por tipo, mantendo id e telegramFileId para cache
            type MediaItem = { url: string; fileId?: string; itemId?: string };
            const photos: MediaItem[] = [];
            const videos: MediaItem[] = [];
            const audios: MediaItem[] = [];

            for (const item of sorted) {
                const meta = this.getMediaMeta(item.url);
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
                await sendPhotoGroup(photos);
                await new Promise((r) => setTimeout(r, 400));
            }

            if (videos.length > 0) {
                await sendVideos(videos);
                await new Promise((r) => setTimeout(r, 400));
            }

            for (const audio of audios) {
                await sendAudio(audio);
                await new Promise((r) => setTimeout(r, 300));
            }
        }
    }

    private async sendCombo(
        client: TelegramClient,
        chatId: string,
        template: any,
    ) {
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
            readyItems.push(await this.prepareMedia(item, client, peer));
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
                        randomId: this.makeRandomId(),
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
    }

    private async sendSingleMedia(
        client: TelegramClient,
        chatId: string,
        template: any,
    ) {
        const mediaUrl = template.mediaUrl || "";
        const meta = this.getMediaMeta(mediaUrl);
        const filename = `file.${meta.ext}`;
        const fileBuffer = await this.fetchFileBuffer(mediaUrl);

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
    }
}
