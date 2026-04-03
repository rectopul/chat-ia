"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var TelegramService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const common_1 = require("@nestjs/common");
const telegram_1 = require("telegram");
const events_1 = require("telegram/events");
const sessions_1 = require("telegram/sessions");
const uploads_1 = require("telegram/client/uploads");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = __importDefault(require("axios"));
const buffer_1 = require("buffer");
const big_integer_1 = __importDefault(require("big-integer"));
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const syncpay_service_1 = require("../syncpay/syncpay.service");
const client_1 = require("@prisma/client");
let TelegramService = TelegramService_1 = class TelegramService {
    constructor(prisma, syncPayService) {
        this.prisma = prisma;
        this.syncPayService = syncPayService;
        this.logger = new common_1.Logger(TelegramService_1.name);
        this.clients = new Map();
        this.tempClients = new Map();
        this.businessBots = new Map();
        this.businessBotTokens = new Map();
        this.businessConnections = new Map();
        this.chatConnectionMap = new Map();
    }
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
                    await this.initBusinessBot(account.id, account.businessBotToken);
                    this.logger.log(`Business bot ${account.name} conectado.`);
                }
            }
            catch (err) {
                this.logger.error(`Falha ao iniciar ${account.name}:`, err);
            }
        }
    }
    async onModuleDestroy() {
        for (const [id, client] of this.clients.entries()) {
            try {
                await client.disconnect();
            }
            catch (e) {
                this.logger.error(`Error disconnecting client ${id}:`, e);
            }
        }
        this.clients.clear();
        for (const [id, bot] of this.businessBots.entries()) {
            try {
                await bot.stopPolling();
            }
            catch (e) {
                this.logger.error(`Error stopping business bot ${id}:`, e);
            }
        }
        this.businessBots.clear();
    }
    getMediaMeta(url) {
        const rawExt = (url.split(".").pop()?.split(/[#?]/)[0] ?? "jpg").toLowerCase();
        const ext = rawExt === "webp" ? "jpg" : rawExt;
        const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
        const isAudio = ["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(ext);
        const isImage = !isVideo && !isAudio;
        let mimeType = "image/jpeg";
        if (ext === "png")
            mimeType = "image/png";
        if (ext === "gif")
            mimeType = "image/gif";
        if (isVideo)
            mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";
        if (isAudio)
            mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;
        return { ext, mimeType, isVideo, isAudio, isImage };
    }
    async convertToOggOpus(inputBuffer, inputExt) {
        const ffmpeg = require("fluent-ffmpeg");
        const tmpInput = path.join(os.tmpdir(), `tg_audio_in_${Date.now()}.${inputExt}`);
        const tmpOutput = path.join(os.tmpdir(), `tg_audio_out_${Date.now()}.ogg`);
        await fs.promises.writeFile(tmpInput, inputBuffer);
        try {
            await new Promise((resolve, reject) => {
                ffmpeg(tmpInput)
                    .audioCodec("libopus")
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .format("ogg")
                    .on("end", resolve)
                    .on("error", (err) => {
                    reject(new Error(`ffmpeg conversion failed: ${err?.message ?? JSON.stringify(err)}`));
                })
                    .save(tmpOutput);
            });
        }
        finally {
            await fs.promises.unlink(tmpInput).catch(() => { });
        }
        const outputBuffer = await fs.promises.readFile(tmpOutput);
        await fs.promises.unlink(tmpOutput).catch(() => { });
        return outputBuffer;
    }
    async fetchFileBuffer(url, forceOgg = false) {
        const response = await axios_1.default.get(url, { responseType: "arraybuffer" });
        let buffer = buffer_1.Buffer.from(response.data);
        const rawExt = (url.split(".").pop()?.split(/[#?]/)[0] ?? "").toLowerCase();
        if (rawExt === "webp") {
            const sharp = require("sharp");
            return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        }
        const isAudioExt = ["mp3", "wav", "m4a", "aac", "flac"].includes(rawExt);
        if (forceOgg && isAudioExt) {
            return await this.convertToOggOpus(buffer, rawExt);
        }
        return buffer;
    }
    async uploadFromBuffer(client, filename, buffer) {
        const tmpPath = path.join(os.tmpdir(), `tg_${Date.now()}_${filename}`);
        await fs.promises.writeFile(tmpPath, buffer);
        try {
            const customFile = new uploads_1.CustomFile(filename, buffer.length, tmpPath);
            return await client.uploadFile({ file: customFile, workers: 3 });
        }
        finally {
            await fs.promises.unlink(tmpPath).catch(() => { });
        }
    }
    makeRandomId() {
        return (0, big_integer_1.default)(Math.floor(Math.random() * 1e15).toString());
    }
    async getAudioDuration(buffer) {
        const ffmpeg = require("fluent-ffmpeg");
        return new Promise((resolve, reject) => {
            const tmpPath = path.join(os.tmpdir(), `tg_probe_${Date.now()}.ogg`);
            fs.writeFileSync(tmpPath, buffer);
            ffmpeg.ffprobe(tmpPath, (err, metadata) => {
                fs.unlink(tmpPath, () => { });
                if (err)
                    return reject(err);
                resolve(Math.ceil(metadata?.format?.duration ?? 0));
            });
        });
    }
    buildInputMedia(uploadedFile, meta, filename, forAlbum) {
        const { mimeType, isVideo, isAudio } = meta;
        if (isVideo) {
            return new telegram_1.Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType,
                attributes: [
                    new telegram_1.Api.DocumentAttributeVideo({
                        duration: 0,
                        w: 0,
                        h: 0,
                        supportsStreaming: true,
                        roundMessage: false,
                    }),
                    new telegram_1.Api.DocumentAttributeFilename({ fileName: filename }),
                ],
            });
        }
        if (isAudio) {
            return new telegram_1.Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: "audio/ogg",
                attributes: [
                    new telegram_1.Api.DocumentAttributeAudio({
                        duration: 0,
                        voice: true,
                    }),
                ],
            });
        }
        return new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile });
    }
    async prepareMedia(item, client, peer) {
        const meta = this.getMediaMeta(item.url);
        const filename = `file_${Date.now()}.${meta.ext}`;
        const fileBuffer = await this.fetchFileBuffer(item.url);
        const uploadedFile = await this.uploadFromBuffer(client, filename, fileBuffer);
        const uploadedMedia = this.buildInputMedia(uploadedFile, meta, filename, true);
        const serverMedia = await client.invoke(new telegram_1.Api.messages.UploadMedia({ peer, media: uploadedMedia }));
        let finalMedia;
        if (serverMedia instanceof telegram_1.Api.MessageMediaPhoto && serverMedia.photo) {
            const p = serverMedia.photo;
            finalMedia = new telegram_1.Api.InputMediaPhoto({
                id: new telegram_1.Api.InputPhoto({
                    id: p.id,
                    accessHash: p.accessHash,
                    fileReference: p.fileReference,
                }),
            });
        }
        else if (serverMedia instanceof telegram_1.Api.MessageMediaDocument &&
            serverMedia.document) {
            const d = serverMedia.document;
            finalMedia = new telegram_1.Api.InputMediaDocument({
                id: new telegram_1.Api.InputDocument({
                    id: d.id,
                    accessHash: d.accessHash,
                    fileReference: d.fileReference,
                }),
            });
        }
        else {
            throw new Error(`UploadMedia retornou tipo inesperado: ${serverMedia.className}`);
        }
        return {
            finalMedia,
            isImage: meta.isImage,
            isVideo: meta.isVideo,
            isAudio: meta.isAudio,
        };
    }
    async sendPixAudio(botId, chatId) {
        const instructionsAudio = await this.prisma.pixAudioConfig.findFirst({
            where: { botId, isActive: true },
        });
        if (!instructionsAudio)
            return;
        const client = this.clients.get(botId);
        if (!client)
            return;
        const peer = await client.getInputEntity(String(chatId));
        const audioBuffer = await this.fetchFileBuffer(instructionsAudio.audioUrl, true);
        const duration = await this.getAudioDuration(audioBuffer);
        const uploadedFile = await this.uploadFromBuffer(client, `voice_${Date.now()}.ogg`, audioBuffer);
        const voiceMedia = new telegram_1.Api.InputMediaUploadedDocument({
            file: uploadedFile,
            mimeType: "audio/ogg",
            attributes: [
                new telegram_1.Api.DocumentAttributeAudio({ duration, voice: true }),
            ],
        });
        await client.invoke(new telegram_1.Api.messages.SendMedia({
            peer,
            media: voiceMedia,
            message: "",
            randomId: this.makeRandomId(),
        }));
    }
    getBusinessBotToken(botId) {
        return this.businessBotTokens.get(botId);
    }
    async sendDontSellMenu(botId, chatId, token, businessConnectionId) {
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
        if (!products.length)
            return;
        const hasDiscount = discountConfig?.isActive && discountConfig?.discountText;
        const discountPercent = hasDiscount
            ? discountConfig.discountPercent
            : 0;
        const inlineKeyboard = products.map((p) => {
            if (hasDiscount) {
                const discountedCents = Math.round(p.priceCents * (1 - discountPercent / 100));
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
    async scheduleDontSellJobs(botId, chatId, userId, businessConnectionId) {
        const dontSellTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: client_1.MessageTemplateKey.DONT_SELL, isActive: true },
        });
        if (!dontSellTemplate) {
            this.logger.debug(`[scheduleDontSellJobs] Nenhum template DONT_SELL ativo`);
            return;
        }
        const user = await this.prisma.telegramUser.findUnique({
            where: { chatId: chatId.toString() },
        });
        if (!user) {
            this.logger.warn(`[scheduleDontSellJobs] Usuário não encontrado para chatId=${chatId}`);
            return;
        }
        let intervals = await this.prisma.dontSellInterval.findMany({
            where: { botId, isActive: true },
            orderBy: { delaySeconds: "asc" },
        });
        if (!intervals.length) {
            intervals = await this.prisma.dontSellInterval.findMany({
                where: { isActive: true },
                orderBy: { delaySeconds: "asc" },
            });
        }
        if (!intervals.length) {
            this.logger.debug(`[scheduleDontSellJobs] Nenhum intervalo DONT_SELL configurado`);
            return;
        }
        const botAccountExists = await this.prisma.botAccount.findUnique({
            where: { id: botId },
            select: { id: true },
        });
        if (!botAccountExists) {
            this.logger.error(`[scheduleDontSellJobs] botId=${botId} não encontrado em BotAccount — jobs não criados`);
            return;
        }
        this.logger.debug(`[scheduleDontSellJobs] botId=${botId} connId=${businessConnectionId}`);
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
            botId,
            telegramUserId: user.telegramUserId,
            chatId: chatId.toString(),
            templateId: dontSellTemplate.id,
            ruleId: dontSellRule.id,
            runAt: new Date(now.getTime() + interval.delaySeconds * 1000),
            status: "PENDING",
        }));
        await this.prisma.scheduledMessageJob.createMany({
            data: jobsToCreate,
            skipDuplicates: true,
        });
        this.logger.log(`[scheduleDontSellJobs] ${jobsToCreate.length} jobs agendados para chatId=${chatId} ` +
            `(botId=${botId}): ${intervals.map((i) => `T+${i.delaySeconds}s`).join(", ")}`);
    }
    async confirmPayment(saleId) {
        const sale = await this.prisma.sale.findUnique({
            where: { id: saleId },
            include: { product: true, user: true },
        });
        if (!sale)
            throw new Error(`Venda não encontrada: ${saleId}`);
        if (!sale.product.description) {
            throw new Error(`Produto "${sale.product.title}" não tem descrição/link configurado`);
        }
        const token = this.businessBotTokens.get(sale.botId);
        if (!token) {
            throw new Error(`Token do business bot não encontrado para botId: ${sale.botId}`);
        }
        const businessConnectionId = await this.resolveConnectionForChat(sale.botId, sale.user.chatId);
        if (!businessConnectionId) {
            throw new Error(`Business connection não encontrada para chatId: ${sale.user.chatId}`);
        }
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
        });
        this.logger.log(`[confirmPayment] Conteúdo enviado para chatId=${sale.user.chatId} (saleId=${saleId})`);
    }
    buildPixMessage(product, pixCode, finalAmountCents, discountPercent) {
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
    async sendMessageHttp(token, chatId, text, extra) {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const { reply_markup, ...restExtra } = extra ?? {};
        const payload = {
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
        const { data } = await axios_1.default.post(url, payload);
        if (!data.ok)
            throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
        return data.result;
    }
    async answerCallbackQuery(token, queryId) {
        try {
            await axios_1.default.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { callback_query_id: queryId });
        }
        catch (_) { }
    }
    async send(text, token, chatId, businessConnectionId, extra) {
        await this.sendMessageHttp(token, chatId, text, {
            business_connection_id: businessConnectionId,
            parse_mode: "Markdown",
            ...extra,
        });
    }
    async resolveConnectionForChat(botId, chatId) {
        const fromChat = this.chatConnectionMap.get(`${botId}:${chatId}`);
        if (fromChat)
            return fromChat;
        const fromOwner = this.businessConnections.get(`${botId}:${chatId}`);
        if (fromOwner)
            return fromOwner;
        const conn = await this.prisma.businessConnection.findFirst({
            where: { botId, isEnabled: true },
        });
        return conn?.connectionId;
    }
    getBusinessConnectionId(botId, userTelegramId) {
        return this.businessConnections.get(`${botId}:${userTelegramId}`);
    }
    async initBusinessBot(botId, token) {
        if (this.businessBots.has(botId)) {
            this.logger.warn(`Business bot ${botId} já ativo, reiniciando...`);
            try {
                await this.businessBots.get(botId).stopPolling();
                await new Promise((r) => setTimeout(r, 2000));
            }
            catch (_) { }
            this.businessBots.delete(botId);
        }
        try {
            await axios_1.default.post(`https://api.telegram.org/bot${token}/getUpdates`, {
                timeout: 0,
                offset: -1,
            });
        }
        catch (_) { }
        await new Promise((r) => setTimeout(r, 1000));
        this.businessBotTokens.set(botId, token);
        const bot = new node_telegram_bot_api_1.default(token, {
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
            this.businessConnections.set(`${botId}:${conn.userTelegramId}`, conn.connectionId);
        }
        this.logger.log(`[initBusinessBot] ${saved.length} connections carregadas para bot ${botId}`);
    }
    registerBusinessConnectionHandler(bot, botId) {
        bot.on("business_connection", async (connection) => {
            const { id: connectionId, user, is_enabled } = connection;
            const key = `${botId}:${user.id}`;
            if (!is_enabled) {
                this.logger.warn(`Business connection revogada: ${connectionId}`);
                this.businessConnections.delete(key);
                await this.prisma.businessConnection.updateMany({
                    where: { connectionId },
                    data: { isEnabled: false },
                });
                return;
            }
            this.businessConnections.set(key, connectionId);
            this.logger.log(`Business connection: user ${user.id} → ${connectionId}`);
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
    registerBusinessMessageHandler(bot, botId, token) {
        bot.on("business_message", async (msg) => {
            this.logger.debug(`[business_message RAW] ${JSON.stringify({
                message_id: msg.message_id,
                text: msg.text,
                business_connection_id: msg.business_connection_id,
                from: msg.from,
                chat: msg.chat,
            })}`);
            const text = (msg.text ?? "").toLowerCase().trim();
            const chatId = msg.chat.id;
            const userId = msg.from?.id;
            const businessConnectionId = msg.business_connection_id;
            if (msg.from?.is_bot)
                return;
            if (!businessConnectionId)
                return;
            const ownerConn = await this.prisma.businessConnection.findFirst({
                where: { connectionId: businessConnectionId, isEnabled: true },
            });
            const ownerTelegramId = ownerConn?.userTelegramId;
            if (ownerTelegramId && String(userId) === ownerTelegramId) {
                this.logger.debug(`[business_message] ignorando mensagem do dono (userId=${userId})`);
                return;
            }
            this.chatConnectionMap.set(`${botId}:${chatId}`, businessConnectionId);
            this.logger.debug(`[business_message] chatId=${chatId} userId=${userId} connId=${businessConnectionId}`);
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
            const delay = (ms) => new Promise((r) => setTimeout(r, ms));
            const sendMenu = async (message, buttons) => {
                const inline_keyboard = buttons.map((row) => row.map((btn) => ({
                    text: btn.text,
                    ...(btn.url
                        ? { url: btn.url }
                        : { callback_data: btn.callbackData ?? "noop" }),
                })));
                await this.sendMessageHttp(token, chatId, message, {
                    business_connection_id: businessConnectionId,
                    parse_mode: "Markdown",
                    reply_markup: { inline_keyboard },
                });
            };
            const isGreeting = text === "/start" ||
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
                    this.logger.debug(`[business_message] novo usuário chatId=${chatId}, iniciando fluxo completo`);
                    this.handleGreeting(botId, chatId, token, businessConnectionId, userId, delay, sendMenu).catch((err) => this.logger.error(`Erro no handleGreeting para ${chatId}:`, err));
                }
                else {
                    this.logger.debug(`[business_message] usuário existente chatId=${chatId}, agendando DONT_SELL se aplicável`);
                    const hasPurchased = await this.prisma.sale.findFirst({
                        where: {
                            telegramUserId: userId.toString(),
                            status: "PAID",
                        },
                    });
                    if (!hasPurchased) {
                        this.scheduleDontSellJobs(botId, chatId, userId, businessConnectionId).catch((err) => this.logger.error(`Erro ao agendar DONT_SELL para ${chatId}:`, err));
                    }
                    else {
                        this.logger.debug(`[business_message] usuário ${chatId} já comprou, nenhuma ação`);
                    }
                }
                return;
            }
            if (text === "💬 suporte") {
                await this.sendMessageHttp(token, chatId, "🙋 Nossa equipe entrará em contato em breve!", { business_connection_id: businessConnectionId }).catch((err) => this.logger.error(`Erro ao enviar suporte:`, err));
            }
        });
    }
    async handleGreeting(botId, chatId, token, businessConnectionId, userId, delay, sendMenu) {
        const businessCtx = { token, businessConnectionId, botId };
        const welcomeTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: client_1.MessageTemplateKey.WELCOME },
            include: { mediaItems: true },
        });
        if (welcomeTemplate) {
            await this.sendTemplate(botId, chatId.toString(), welcomeTemplate, businessCtx);
        }
        const timedTemplates = await this.prisma.timedMessageRule.findMany({
            where: {
                botId,
                name: { not: "DONT_SELL Auto" },
            },
            include: { template: { include: { mediaItems: true } } },
            orderBy: { delaySeconds: "asc" },
        });
        const greetingStart = Date.now();
        for (const timedTemplate of timedTemplates) {
            const templateId = timedTemplate.template?.id;
            const targetMs = timedTemplate.delaySeconds * 1000;
            const elapsedMs = Date.now() - greetingStart;
            const waitMs = targetMs - elapsedMs;
            if (waitMs > 0) {
                this.logger.debug(`[handleGreeting] Aguardando ${(waitMs / 1000).toFixed(1)}s ` +
                    `para "${timedTemplate.name}" (alvo T+${timedTemplate.delaySeconds}s)`);
                await delay(waitMs);
            }
            this.logger.debug(`[handleGreeting] Enviando "${timedTemplate.name}" ` +
                `em T+${((Date.now() - greetingStart) / 1000).toFixed(1)}s (templateId=${templateId})`);
            try {
                await this.sendTemplate(botId, chatId.toString(), timedTemplate.template, businessCtx);
            }
            catch (err) {
                this.logger.error(`[handleGreeting] Erro ao enviar timed template ${templateId} ` +
                    `(${timedTemplate.template?.type}): ${err?.message ?? err}`);
                if (err?.errors) {
                    this.logger.error(`[handleGreeting] AggregateError details:`, err.errors);
                }
            }
        }
        const send = async (text, extra) => this.sendMessageHttp(token, chatId, text, {
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
        }
        catch (err) {
            this.logger.error(`[handleGreeting] Erro ao enviar sendMenu para ${chatId}: ${err?.message ?? err}`);
            if (err?.errors) {
                this.logger.error(`[handleGreeting] sendMenu AggregateError details:`, err.errors);
            }
        }
        this.scheduleDontSellJobs(botId, chatId, userId, businessConnectionId);
    }
    scheduleDontSell(botId, chatId, token, userId, businessConnectionId, delay) {
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
                if (hasPurchased)
                    return;
                const dontsellTemplate = await this.prisma.messageTemplate.findFirst({
                    where: { key: client_1.MessageTemplateKey.DONT_SELL },
                    include: { mediaItems: true },
                });
                if (dontsellTemplate) {
                    await this.sendTemplate(botId, chatId.toString(), dontsellTemplate, {
                        token,
                        businessConnectionId,
                        botId,
                    });
                }
                const connStillValid = await this.prisma.businessConnection.findFirst({
                    where: {
                        connectionId: businessConnectionId,
                        isEnabled: true,
                    },
                });
                if (!connStillValid) {
                    this.logger.warn(`[scheduleDontSell] connection ${businessConnectionId} não está mais ativa`);
                    return;
                }
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
                if (!products.length)
                    return;
                const hasDiscount = discountConfig?.isActive && discountConfig?.discountText;
                const discountPercent = hasDiscount
                    ? discountConfig.discountPercent
                    : 0;
                const inlineKeyboard = products.map((p) => {
                    if (hasDiscount) {
                        const discountedCents = Math.round(p.priceCents * (1 - discountPercent / 100));
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
                await this.send(String(messageText), token, chatId.toString(), businessConnectionId, { reply_markup: { inline_keyboard: inlineKeyboard } });
            }
            catch (err) {
                this.logger.error(`Erro no DONT_SELL para chatId=${chatId}:`, err);
            }
        })();
    }
    registerCallbackQueryHandler(bot, botId, token) {
        bot.on("callback_query", async (query) => {
            const data = query.data ?? "";
            const chatId = query.message?.chat?.id ?? query.from?.id;
            const queryId = query.id;
            await this.answerCallbackQuery(token, queryId);
            const businessConnectionId = await this.resolveConnectionForChat(botId, chatId);
            if (!businessConnectionId) {
                this.logger.error(`[callback_query] Nenhuma connection encontrada para chatId=${chatId} bot=${botId}`);
                return;
            }
            const send = async (text, extra) => this.sendMessageHttp(token, chatId, text, {
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
                    await this.handleBuy(data, chatId, botId, token, userTelegram, send);
                    return;
                }
                if (data.startsWith("buy_discount:")) {
                    await this.handleBuyDiscount(data, chatId, botId, token, userTelegram, send);
                    return;
                }
                if (data === "support") {
                    await send("🙋 Nossa equipe entrará em contato em breve!");
                    return;
                }
            }
            catch (err) {
                this.logger.error(`Erro no callback_query handler chatId=${chatId}:`, err);
                await send("❌ Ocorreu um erro. Tente novamente.").catch(() => { });
            }
        });
    }
    async handleListProducts(send) {
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
    async handleBuy(data, chatId, botId, token, userTelegram, send) {
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
                rawPayload: pixData,
            },
        });
        await this.sendPixAudio(botId, chatId).catch((err) => this.logger.error(`Erro ao enviar áudio PIX:`, err));
        await send(this.buildPixMessage(product, pixData.pix_code, product.priceCents));
    }
    async handleBuyDiscount(data, chatId, botId, token, userTelegram, send) {
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
        const finalAmountCents = Math.round(product.priceCents * (1 - discountPercent / 100));
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
                rawPayload: pixData,
            },
        });
        await this.sendPixAudio(botId, chatId).catch((err) => this.logger.error(`Erro ao enviar áudio PIX:`, err));
        await send(this.buildPixMessage(product, pixData.pix_code, finalAmountCents, discountPercent));
    }
    async sendBusinessMessageWithKeyboard(botId, businessConnectionId, recipientChatId, text, keyboard) {
        const token = this.businessBotTokens.get(botId);
        if (!token)
            throw new Error(`Token não encontrado para botId: ${botId}`);
        await this.sendMessageHttp(token, recipientChatId, text, {
            business_connection_id: businessConnectionId,
            reply_markup: {
                keyboard: keyboard.map((row) => row.map((label) => ({ text: label }))),
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        });
    }
    async sendKeyboardAsBusinessUser(botId, ownerTelegramId, recipientChatId, text, keyboard) {
        const connectionId = this.getBusinessConnectionId(botId, ownerTelegramId);
        if (!connectionId) {
            throw new Error(`Nenhuma business connection ativa para bot ${botId} / user ${ownerTelegramId}.`);
        }
        await this.sendBusinessMessageWithKeyboard(botId, connectionId, recipientChatId, text, keyboard);
    }
    async getBotStatus() {
        const items = [];
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
            description: "Autentique uma conta em Configurações → Bot (API ID + API Hash + OTP).",
            ok: !!botAccount,
            critical: true,
        });
        items.push({
            key: "business_bot_token",
            label: "Token do Business Bot configurado",
            description: "Configure o token do @BotFather em Configurações → Bot.",
            ok: !!botAccount?.businessBotToken,
            critical: true,
        });
        items.push({
            key: "business_bot_running",
            label: "Business Bot ativo e conectado",
            description: "O bot não está rodando. Verifique o token e reinicie.",
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
            description: "Conecte o bot em: Telegram → Configurações → Telegram Business → Chatbots.",
            ok: !!businessConn,
            critical: true,
        });
        const welcomeTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: client_1.MessageTemplateKey.WELCOME },
        });
        items.push({
            key: "welcome_template",
            label: 'Template "WELCOME" cadastrado',
            description: 'Crie um template com a chave "WELCOME" em Templates → Novo Template.',
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
            description: "Defina SYNCPAY_API_KEY e SYNCPAY_TOKEN nas variáveis de ambiente.",
            ok: !!process.env.SYNCPAY_API_KEY || !!process.env.SYNCPAY_TOKEN,
            critical: true,
        });
        const dontSellTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: client_1.MessageTemplateKey.DONT_SELL },
        });
        items.push({
            key: "dont_sell_template",
            label: 'Template "DONT_SELL" cadastrado (opcional)',
            description: 'Enviado 4 min após o primeiro contato sem compra. Chave: "DONT_SELL".',
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
    async sendCode(botId, phoneNumber) {
        const bot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
        });
        if (!bot?.apiId || !bot?.apiHash)
            throw new Error("API ID/Hash faltando");
        const existing = this.tempClients.get(botId);
        if (existing) {
            try {
                await existing.client.disconnect();
            }
            catch (_) { }
            this.tempClients.delete(botId);
        }
        const client = new telegram_1.TelegramClient(new sessions_1.StringSession(""), Number(bot.apiId), bot.apiHash, { connectionRetries: 5 });
        await client.connect();
        const { phoneCodeHash } = await client.sendCode({ apiId: Number(bot.apiId), apiHash: bot.apiHash }, phoneNumber);
        this.tempClients.set(botId, { client, phoneCodeHash });
        return { message: "Código enviado para o Telegram" };
    }
    async verifyCode(botId, phoneNumber, code) {
        const temp = this.tempClients.get(botId);
        if (!temp)
            throw new Error("Sessão expirada. Solicite um novo código.");
        try {
            await temp.client.invoke(new telegram_1.Api.auth.SignIn({
                phoneNumber,
                phoneCodeHash: temp.phoneCodeHash,
                phoneCode: code,
            }));
            return await this._finalizeLogin(botId, temp.client);
        }
        catch (error) {
            if (error.errorMessage === "SESSION_PASSWORD_NEEDED") {
                return { success: false, requires2FA: true };
            }
            throw error;
        }
    }
    async verifyPassword(botId, password) {
        const temp = this.tempClients.get(botId);
        if (!temp)
            throw new Error("Sessão expirada. Solicite um novo código.");
        try {
            await temp.client.signInWithPassword({
                apiId: temp.client.apiId,
                apiHash: temp.client.apiHash,
            }, {
                password: async () => password,
                onError: (err) => {
                    throw err;
                },
            });
            return await this._finalizeLogin(botId, temp.client);
        }
        catch (error) {
            this.logger.error("Erro no 2FA:", error);
            throw error;
        }
    }
    async _finalizeLogin(botId, client) {
        const sessionString = client.session.save();
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
    async initClient(bot) {
        if (this.clients.has(bot.id))
            return;
        const client = new telegram_1.TelegramClient(new sessions_1.StringSession(bot.session || ""), Number(bot.apiId), bot.apiHash, { connectionRetries: 5, retryDelay: 2000 });
        await client.connect();
        this.clients.set(bot.id, client);
        if (!(await client.isUserAuthorized())) {
            this.logger.warn(`Client ${bot.id} não está autorizado, pulando...`);
            this.clients.delete(bot.id);
            return;
        }
        client.addEventHandler(async (event) => {
            const message = event.message;
            if (!message || message.out)
                return;
            const chatId = message.chatId?.toString();
            if (!chatId || chatId.startsWith("-"))
                return;
            const sender = (await message.getSender());
            const telegramUserId = sender?.id?.toString();
            if (!telegramUserId)
                return;
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
            }
            catch (dbErr) {
                this.logger.error("Erro ao salvar/atualizar usuário:", dbErr);
            }
        }, new events_1.NewMessage({}));
    }
    async sendTemplate(botId, chatId, template, businessCtx) {
        this.logger.debug(`[sendTemplate] id=${template.id} type=${template.type} business=${!!businessCtx}`);
        if (businessCtx) {
            await this.sendTemplateViaBotApi(chatId, template, businessCtx);
            return;
        }
        let client = this.clients.get(botId);
        if (!client || !client.connected) {
            const bot = await this.prisma.botAccount.findUnique({
                where: { id: botId },
            });
            if (!bot)
                throw new Error(`Bot not found: ${botId}`);
            await this.initClient(bot);
            client = this.clients.get(botId);
            if (!client)
                throw new Error(`Failed to initialize client for bot: ${botId}`);
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
        }
        catch (error) {
            this.logger.error(`Error sending template to ${chatId} via bot ${botId}:`, error);
            throw error;
        }
    }
    async saveFileId(itemId, isTemplateMedia, fileId) {
        try {
            if (isTemplateMedia) {
                await this.prisma.messageTemplateMedia.update({
                    where: { id: itemId },
                    data: { telegramFileId: fileId },
                });
            }
            else {
                await this.prisma.messageTemplate.update({
                    where: { id: itemId },
                    data: { telegramFileId: fileId },
                });
            }
            this.logger.debug(`[saveFileId] file_id salvo para ${itemId}: ${fileId.slice(0, 40)}...`);
        }
        catch (err) {
            this.logger.warn(`[saveFileId] Falha ao salvar file_id para ${itemId}: ${err?.message}`);
        }
    }
    async sendTemplateViaBotApi(chatId, template, ctx) {
        const base = { business_connection_id: ctx.businessConnectionId };
        const sendText = async (text) => {
            if (!text?.trim())
                return;
            await this.sendMessageHttp(ctx.token, chatId, text, base);
        };
        const sendPhotoGroup = async (items) => {
            if (!items.length)
                return;
            for (let i = 0; i < items.length; i += 10) {
                const chunk = items.slice(i, i + 10);
                const mediaJson = chunk.map((item) => ({
                    type: "photo",
                    media: item.fileId ?? item.url,
                }));
                const { data } = await axios_1.default.post(`https://api.telegram.org/bot${ctx.token}/sendMediaGroup`, {
                    chat_id: chatId,
                    media: mediaJson,
                    ...base,
                });
                if (!data.ok)
                    throw new Error(`sendPhotoGroup error: ${JSON.stringify(data)}`);
                if (Array.isArray(data.result)) {
                    for (let j = 0; j < data.result.length; j++) {
                        const msg = data.result[j];
                        const item = chunk[j];
                        if (item?.itemId && !item.fileId) {
                            const photos = msg?.photo;
                            const bestPhoto = Array.isArray(photos)
                                ? photos[photos.length - 1]
                                : null;
                            if (bestPhoto?.file_id) {
                                await this.saveFileId(item.itemId, true, bestPhoto.file_id);
                                item.fileId = bestPhoto.file_id;
                            }
                        }
                    }
                }
                if (items.length > 10)
                    await new Promise((r) => setTimeout(r, 500));
            }
        };
        const sendVideos = async (items) => {
            const withFileId = items.filter((i) => i.fileId);
            const withoutFileId = items.filter((i) => !i.fileId);
            for (const item of withFileId) {
                const { data } = await axios_1.default.post(`https://api.telegram.org/bot${ctx.token}/sendVideo`, {
                    chat_id: chatId,
                    video: item.fileId,
                    supports_streaming: true,
                    ...base,
                });
                if (!data.ok) {
                    this.logger.warn(`[sendVideos] file_id inválido para ${item.itemId}, tentando re-upload`);
                    withoutFileId.push({ ...item, fileId: undefined });
                }
                else {
                    this.logger.debug(`[sendVideos] Enviado via file_id (instantâneo): ${item.itemId}`);
                }
                await new Promise((r) => setTimeout(r, 300));
            }
            if (!withoutFileId.length)
                return;
            let client = this.clients.get(ctx.botId);
            if (!client)
                throw new Error(`MTProto client não encontrado para bot ${ctx.botId}`);
            if (!client.connected) {
                this.logger.warn(`[sendVideos] Client desconectado, reconectando...`);
                await Promise.race([
                    client.connect(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout ao reconectar MTProto")), 15000)),
                ]);
            }
            const peer = new telegram_1.Api.InputPeerUser({
                userId: (0, big_integer_1.default)(chatId.toString()),
                accessHash: (0, big_integer_1.default)(0),
            });
            for (const item of withoutFileId) {
                const url = item.url;
                const meta = this.getMediaMeta(url);
                const filename = `video_${Date.now()}.${meta.ext}`;
                const buf = await this.fetchFileBuffer(url);
                const uploadedFile = await this.uploadFromBuffer(client, filename, buf);
                const inputMedia = new telegram_1.Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: meta.mimeType,
                    attributes: [
                        new telegram_1.Api.DocumentAttributeVideo({
                            duration: 0,
                            w: 1280,
                            h: 720,
                            supportsStreaming: true,
                            roundMessage: false,
                        }),
                        new telegram_1.Api.DocumentAttributeFilename({
                            fileName: filename,
                        }),
                    ],
                });
                const serverMedia = (await client.invoke(new telegram_1.Api.messages.UploadMedia({ peer, media: inputMedia })));
                if (!(serverMedia instanceof telegram_1.Api.MessageMediaDocument) ||
                    !serverMedia.document) {
                    const className = serverMedia?.className ?? "unknown";
                    throw new Error(`UploadMedia vídeo retornou tipo inesperado: ${className}`);
                }
                const d = serverMedia.document;
                const sentMsg = (await client.invoke(new telegram_1.Api.messages.SendMedia({
                    peer,
                    media: new telegram_1.Api.InputMediaDocument({
                        id: new telegram_1.Api.InputDocument({
                            id: d.id,
                            accessHash: d.accessHash,
                            fileReference: d.fileReference,
                        }),
                    }),
                    message: "",
                    randomId: this.makeRandomId(),
                })));
                if (item.itemId) {
                    try {
                        const updates = sentMsg?.updates ?? sentMsg?.Updates ?? [];
                        const sentMessage = Array.isArray(updates)
                            ? updates.find((u) => u?.message?.media?.document)
                            : null;
                        const fileId = sentMessage?.message?.media?.document?.id?.toString();
                        if (fileId) {
                            await this.saveFileId(item.itemId, true, fileId);
                        }
                    }
                    catch (_) {
                    }
                }
                await new Promise((r) => setTimeout(r, 500));
            }
        };
        const sendAudio = async (item) => {
            const url = item.url;
            const rawExt = (url.split(".").pop()?.split(/[#?]/)[0] ?? "mp3").toLowerCase();
            const FormData = require("form-data");
            if (item.fileId) {
                this.logger.debug(`[sendAudio] Enviando via file_id (instantâneo): ${item.itemId}`);
                const { data } = await axios_1.default.post(`https://api.telegram.org/bot${ctx.token}/sendVoice`, { chat_id: chatId, voice: item.fileId, ...base });
                if (data.ok)
                    return;
                this.logger.warn(`[sendAudio] file_id inválido, re-enviando via upload`);
            }
            let audioBuffer;
            let filename;
            let contentType;
            let method;
            try {
                const rawBuffer = await this.fetchFileBuffer(url);
                audioBuffer = await this.convertToOggOpus(rawBuffer, rawExt);
                filename = `voice_${Date.now()}.ogg`;
                contentType = "audio/ogg";
                method = "sendVoice";
                this.logger.debug(`[sendAudio] Convertido para OGG opus, enviando como voice note`);
            }
            catch (convErr) {
                this.logger.warn(`[sendAudio] Conversão OGG falhou (${convErr?.message}), usando sendAudio`);
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
            const { data } = await axios_1.default.post(`https://api.telegram.org/bot${ctx.token}/${method}`, form, { headers: form.getHeaders() });
            if (!data.ok)
                throw new Error(`${method} error: ${JSON.stringify(data)}`);
            if (item.itemId) {
                const fileId = data.result?.voice?.file_id ?? data.result?.audio?.file_id;
                if (fileId)
                    await this.saveFileId(item.itemId, true, fileId);
            }
        };
        if (template.type === "TEXT") {
            await sendText(template.text || "");
            return;
        }
        if (template.type !== "COMBO") {
            const url = template.mediaUrl || template.mediaItems?.[0]?.url || "";
            const fileId = template.telegramFileId ||
                template.mediaItems?.[0]?.telegramFileId;
            const itemId = template.mediaItems?.[0]?.id ?? template.id;
            if (!url) {
                this.logger.warn(`[sendTemplateViaBotApi] Template ${template.id} sem URL de mídia`);
                if (template.text)
                    await sendText(template.text);
                return;
            }
            const meta = this.getMediaMeta(url);
            this.logger.debug(`[sendTemplateViaBotApi] single media ` +
                `isAudio=${meta.isAudio} isVideo=${meta.isVideo} ` +
                `hasFileId=${!!fileId}`);
            if (meta.isAudio) {
                await sendAudio({ url, fileId, itemId });
            }
            else if (meta.isVideo) {
                await sendVideos([{ url, fileId, itemId }]);
            }
            else {
                await sendPhotoGroup([{ url, fileId, itemId }]);
            }
            return;
        }
        if (template.mediaItems?.length > 0) {
            const sorted = [...template.mediaItems].sort((a, b) => a.order - b.order);
            const photos = [];
            const videos = [];
            const audios = [];
            for (const item of sorted) {
                const meta = this.getMediaMeta(item.url);
                const entry = {
                    url: item.url,
                    fileId: item.telegramFileId ?? undefined,
                    itemId: item.id,
                };
                if (meta.isAudio)
                    audios.push(entry);
                else if (meta.isVideo)
                    videos.push(entry);
                else
                    photos.push(entry);
            }
            const hasVisual = photos.length > 0 || videos.length > 0;
            if (template.text && !hasVisual)
                await sendText(template.text);
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
    async sendCombo(client, chatId, template) {
        const sortedMedia = [...template.mediaItems].sort((a, b) => a.order - b.order);
        if (template.text) {
            await client.sendMessage(chatId, { message: template.text });
            await new Promise((r) => setTimeout(r, 300));
        }
        const peer = await client.getInputEntity(chatId);
        const readyItems = [];
        for (const item of sortedMedia) {
            readyItems.push(await this.prepareMedia(item, client, peer));
        }
        let imageQueue = [];
        const flushImages = async () => {
            if (!imageQueue.length)
                return;
            if (imageQueue.length === 1) {
                await client.invoke(new telegram_1.Api.messages.SendMedia({
                    peer,
                    media: imageQueue[0].media,
                    message: "",
                    randomId: this.makeRandomId(),
                }));
            }
            else {
                await client.invoke(new telegram_1.Api.messages.SendMultiMedia({
                    peer,
                    multiMedia: imageQueue,
                }));
            }
            imageQueue = [];
            await new Promise((r) => setTimeout(r, 400));
        };
        for (const readyItem of readyItems) {
            if (readyItem.isImage) {
                imageQueue.push(new telegram_1.Api.InputSingleMedia({
                    media: readyItem.finalMedia,
                    message: "",
                    randomId: this.makeRandomId(),
                }));
            }
            else {
                await flushImages();
                await client.invoke(new telegram_1.Api.messages.SendMedia({
                    peer,
                    media: readyItem.finalMedia,
                    message: "",
                    randomId: this.makeRandomId(),
                }));
                await new Promise((r) => setTimeout(r, 400));
            }
        }
        await flushImages();
    }
    async sendSingleMedia(client, chatId, template) {
        const mediaUrl = template.mediaUrl || "";
        const meta = this.getMediaMeta(mediaUrl);
        const filename = `file.${meta.ext}`;
        const fileBuffer = await this.fetchFileBuffer(mediaUrl);
        if (meta.isVideo || meta.isAudio) {
            const uploadedFile = await this.uploadFromBuffer(client, filename, fileBuffer);
            const media = this.buildInputMedia(uploadedFile, meta, filename, false);
            await client.invoke(new telegram_1.Api.messages.SendMedia({
                peer: await client.getInputEntity(chatId),
                media,
                message: template.text || "",
                randomId: this.makeRandomId(),
            }));
        }
        else {
            await client.sendFile(chatId, {
                file: fileBuffer,
                caption: template.text || undefined,
                forceDocument: false,
            });
        }
    }
};
exports.TelegramService = TelegramService;
exports.TelegramService = TelegramService = TelegramService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        syncpay_service_1.SyncPayService])
], TelegramService);
//# sourceMappingURL=telegram.service.js.map