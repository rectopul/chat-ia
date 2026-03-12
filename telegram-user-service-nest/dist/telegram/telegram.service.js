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
        await new Promise((resolve, reject) => {
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
        await Promise.all([
            fs.promises.unlink(tmpInput).catch(() => { }),
            fs.promises.unlink(tmpOutput).catch(() => { }),
        ]);
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
        const uploadedFile = await this.uploadFromBuffer(client, `voice_${Date.now()}.ogg`, audioBuffer);
        const voiceMedia = new telegram_1.Api.InputMediaUploadedDocument({
            file: uploadedFile,
            mimeType: "audio/ogg",
            attributes: [
                new telegram_1.Api.DocumentAttributeAudio({ duration: 0, voice: true }),
            ],
        });
        await client.invoke(new telegram_1.Api.messages.SendMedia({
            peer,
            media: voiceMedia,
            message: "",
            randomId: this.makeRandomId(),
        }));
    }
    buildPixMessage(product, pixCode, finalAmountCents, discountPercent) {
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
    async sendMessageHttp(token, chatId, text, extra) {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const payload = {
            chat_id: chatId,
            text,
            ...extra,
            ...(extra?.reply_markup
                ? { reply_markup: JSON.stringify(extra.reply_markup) }
                : {}),
        };
        const { data } = await axios_1.default.post(url, payload);
        if (!data.ok)
            throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
        return data.result;
    }
    async answerCallbackQuery(token, queryId) {
        try {
            await axios_1.default.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                callback_query_id: queryId,
            });
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
    async resolveBusinessConnectionId(botId) {
        for (const [key, connId] of this.businessConnections.entries()) {
            if (key.startsWith(`${botId}:`))
                return connId;
        }
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
                update: { isEnabled: true },
            });
        });
    }
    registerBusinessMessageHandler(bot, botId, token) {
        bot.on("business_message", async (msg) => {
            const text = (msg.text ?? "").toLowerCase().trim();
            const chatId = msg.chat.id;
            const userId = msg.from?.id;
            const businessConnectionId = msg.business_connection_id;
            if (!businessConnectionId)
                return;
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
                const escapeV2 = (s) => s.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
                const escapedMessage = escapeV2(message).replace(/\\\*/g, "*");
                try {
                    await this.sendMessageHttp(token, chatId, escapedMessage, {
                        business_connection_id: businessConnectionId,
                        parse_mode: "MarkdownV2",
                        reply_markup: {
                            inline_keyboard: buttons.map((row) => row.map((btn) => ({
                                text: btn.text,
                                ...(btn.url
                                    ? { url: btn.url }
                                    : {
                                        callback_data: btn.callbackData ?? "noop",
                                    }),
                            }))),
                        },
                    });
                }
                catch (err) {
                    this.logger.error(`Erro ao enviar menu: ${err.response?.data?.description || err.message}`);
                    await this.sendMessageHttp(token, chatId, "Olá! Escolha uma opção no menu abaixo:", {
                        business_connection_id: businessConnectionId,
                        reply_markup: {
                            inline_keyboard: buttons.map((row) => row.map((btn) => ({
                                text: btn.text,
                                callback_data: btn.callbackData ?? "noop",
                            }))),
                        },
                    });
                }
            };
            const isGreeting = text === "/start" ||
                text === "oi" ||
                text === "olá" ||
                text === "ola" ||
                text === "bom dia" ||
                text === "boa noite" ||
                text === "boa tarde" ||
                text === "menu" ||
                text.includes("ae") ||
                text.includes("bom") ||
                text.includes("boa") ||
                text.includes("oi");
            if (isGreeting) {
                try {
                    await this.handleGreeting(botId, chatId, token, businessConnectionId, userId, delay, sendMenu);
                }
                catch (err) {
                    this.logger.error(`Erro ao enviar menu para ${chatId}:`, err);
                }
                return;
            }
            if (text === "💬 suporte") {
                await this.sendMessageHttp(token, chatId, "🙋 Nossa equipe entrará em contato em breve!", {
                    business_connection_id: businessConnectionId,
                });
            }
        });
    }
    async handleGreeting(botId, chatId, token, businessConnectionId, userId, delay, sendMenu) {
        const welcomeTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: "WELCOME" },
            include: { mediaItems: true },
        });
        if (welcomeTemplate) {
            await this.sendTemplate(botId, chatId.toString(), welcomeTemplate);
        }
        const timedTemplates = await this.prisma.timedMessageRule.findMany({
            where: { botId },
            include: { template: { include: { mediaItems: true } } },
            orderBy: { delaySeconds: "asc" },
        });
        for (const timedTemplate of timedTemplates) {
            await delay(timedTemplate.delaySeconds * 1000);
            await this.sendTemplate(botId, chatId.toString(), timedTemplate.template);
        }
        await sendMenu("👋 Olá! Gostou das prévias, que tal adquirir um dos nossos planos e receber mais conteúdos exclusivos?", [
            [{ text: "🛍️ Ver Produtos", callbackData: "list_products" }],
            [{ text: "💬 Suporte", callbackData: "support" }],
        ]);
        this.scheduleDontSell(botId, chatId, token, userId, delay);
    }
    scheduleDontSell(botId, chatId, token, userId, delay) {
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
                    where: { key: "DONT_SELL" },
                    include: { mediaItems: true },
                });
                if (dontsellTemplate) {
                    await this.sendTemplate(botId, chatId.toString(), dontsellTemplate);
                }
                const bcId = await this.resolveBusinessConnectionId(botId);
                if (!bcId)
                    return;
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
                const discountPercent = discountConfig?.isActive
                    ? discountConfig.discountPercent
                    : 10;
                const inlineKeyboard = products.map((p) => {
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
                });
                await this.send(`🔥 *Oferta especial por tempo limitado!*\n\nGanhe *${discountPercent}% de desconto* agora:`, token, chatId.toString(), bcId, { reply_markup: { inline_keyboard: inlineKeyboard } });
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
            const businessConnectionId = await this.resolveBusinessConnectionId(botId);
            if (!businessConnectionId) {
                this.logger.error(`Nenhuma business connection ativa para bot ${botId}`);
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
        await send(`⏳ Gerando PIX para *${product.title}*...`);
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
        await send(this.buildPixMessage(product, pixData.pix_code, product.priceCents));
        await this.sendPixAudio(botId, chatId).catch((err) => this.logger.error(`Erro ao enviar áudio PIX:`, err));
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
        await send(this.buildPixMessage(product, pixData.pix_code, finalAmountCents, discountPercent));
        await this.sendPixAudio(botId, chatId).catch((err) => this.logger.error(`Erro ao enviar áudio PIX:`, err));
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
    async sendTemplate(botId, chatId, template) {
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
        this.logger.debug(`[sendTemplate] id=${template.id} type=${template.type}`);
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
    async sendCombo(client, chatId, template) {
        const sortedMedia = [...template.mediaItems].sort((a, b) => a.order - b.order);
        if (template.text) {
            await client.sendMessage(chatId, { message: template.text });
            await new Promise((r) => setTimeout(r, 300));
        }
        const peer = await client.getInputEntity(chatId);
        const readyItems = [];
        for (let i = 0; i < sortedMedia.length; i++) {
            const item = sortedMedia[i];
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