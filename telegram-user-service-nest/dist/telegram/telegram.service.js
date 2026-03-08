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
        const activeAccounts = await this.prisma.botAccount.findMany({
            where: {
                isUserAccount: true,
                session: { not: null },
                isActive: true,
            },
        });
        for (const account of activeAccounts) {
            try {
                await this.initClient(account);
                this.logger.log(`Conta ${account.name} reconectada automaticamente.`);
            }
            catch (err) {
                this.logger.error(`Falha ao reconectar ${account.name}:`, err);
            }
        }
        const businessBotAccounts = await this.prisma.botAccount.findMany({
            where: {
                isUserAccount: false,
                businessBotToken: { not: null },
                isActive: true,
            },
        });
        for (const account of businessBotAccounts) {
            try {
                await this.initBusinessBot(account.id, account.businessBotToken);
                this.logger.log(`Business bot ${account.name} conectado.`);
            }
            catch (err) {
                this.logger.error(`Falha ao conectar business bot ${account.name}:`, err);
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
    async fetchFileBuffer(url) {
        const response = await axios_1.default.get(url, { responseType: "arraybuffer" });
        return buffer_1.Buffer.from(response.data);
    }
    getMediaMeta(url) {
        const ext = (url.split(".").pop()?.split(/[#?]/)[0] ?? "jpg").toLowerCase();
        const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
        const isAudio = ["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(ext);
        const isImage = !isVideo && !isAudio;
        let mimeType = "image/jpeg";
        if (ext === "png")
            mimeType = "image/png";
        if (ext === "gif")
            mimeType = "image/gif";
        if (ext === "webp")
            mimeType = "image/webp";
        if (isVideo)
            mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";
        if (isAudio)
            mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;
        return { ext, mimeType, isVideo, isAudio, isImage };
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
                mimeType,
                attributes: [
                    new telegram_1.Api.DocumentAttributeAudio({
                        duration: 0,
                        voice: false,
                    }),
                    new telegram_1.Api.DocumentAttributeFilename({ fileName: filename }),
                ],
            });
        }
        if (forAlbum) {
            return new telegram_1.Api.InputMediaUploadedPhoto({
                file: uploadedFile,
            });
        }
        return new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile });
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
        this.logger.debug("sendMessage payload: " + JSON.stringify(payload));
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
    async initBusinessBot(botId, token) {
        if (this.businessBots.has(botId))
            return;
        this.businessBotTokens.set(botId, token);
        const bot = new node_telegram_bot_api_1.default(token, {
            polling: {
                params: {
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
        bot.on("business_message", async (msg) => {
            const text = (msg.text ?? "").toLowerCase().trim();
            const chatId = msg.chat.id;
            const businessConnectionId = msg.business_connection_id;
            this.logger.debug(`business_message — chat: ${chatId}, texto: "${text}", connectionId: ${businessConnectionId}`);
            if (!businessConnectionId)
                return;
            const sendMenu = async (message, buttons) => {
                const escapeV2 = (s) => s.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
                try {
                    const escapedMessage = escapeV2(message).replace(/\\\*/g, "*");
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
            const sendText = async (message) => {
                await this.sendMessageHttp(token, chatId, message, {
                    business_connection_id: businessConnectionId,
                    reply_markup: { remove_keyboard: true },
                });
            };
            if (text === "/start" ||
                text === "oi" ||
                text === "olá" ||
                text === "ola" ||
                text === "menu") {
                try {
                    const weallcomeTemplate = await this.prisma.messageTemplate.findFirst({
                        where: {
                            key: "WELCOME",
                        },
                        include: { mediaItems: true },
                    });
                    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                    if (weallcomeTemplate) {
                        await this.sendTemplate(botId, chatId.toString(), weallcomeTemplate);
                    }
                    await delay(5000);
                    await sendMenu("👋 Olá! Gostou das prévias, que tal adquirir um dos nossos planos e receber mais conteúdos exclusivos?", [
                        [
                            {
                                text: "🛍️ Ver Produtos",
                                callbackData: "list_products",
                            },
                        ],
                        [{ text: "💬 Suporte", callbackData: "support" }],
                    ]);
                }
                catch (err) {
                    this.logger.error(`Erro ao enviar menu para ${chatId}:`, err);
                }
                return;
            }
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
            if (text === "💬 suporte") {
                try {
                    await sendText("🙋 Nossa equipe entrará em contato em breve!");
                }
                catch (err) {
                    this.logger.error(`Erro suporte para ${chatId}:`, err);
                }
                return;
            }
        });
        bot.on("callback_query", async (query) => {
            const data = query.data ?? "";
            const chatId = query.message?.chat?.id ?? query.from?.id;
            const queryId = query.id;
            this.logger.debug(`[callback_query] data="${data}" chatId=${chatId}`);
            await this.answerCallbackQuery(token, queryId);
            let businessConnectionId;
            for (const [key, connId] of this.businessConnections.entries()) {
                if (key.startsWith(`${botId}:`)) {
                    businessConnectionId = connId;
                    break;
                }
            }
            if (!businessConnectionId) {
                const conn = await this.prisma.businessConnection.findFirst({
                    where: { botId, isEnabled: true },
                });
                businessConnectionId = conn?.connectionId;
            }
            this.logger.debug(`[callback_query] businessConnectionId=${businessConnectionId}`);
            if (!businessConnectionId) {
                this.logger.error(`Nenhuma business connection ativa para bot ${botId}`);
                return;
            }
            const send = async (text, extra) => {
                await this.sendMessageHttp(token, chatId, text, {
                    business_connection_id: businessConnectionId,
                    parse_mode: "Markdown",
                    ...extra,
                });
            };
            try {
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
                    await send(pixMsg);
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
        this.businessBots.set(botId, bot);
        const saved = await this.prisma.businessConnection.findMany({
            where: { botId, isEnabled: true },
        });
        for (const conn of saved) {
            this.businessConnections.set(`${botId}:${conn.userTelegramId}`, conn.connectionId);
        }
    }
    getBusinessConnectionId(botId, userTelegramId) {
        return this.businessConnections.get(`${botId}:${userTelegramId}`);
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
    async initClient(bot) {
        if (this.clients.has(bot.id))
            return;
        const stringSession = new sessions_1.StringSession(bot.session || "");
        const client = new telegram_1.TelegramClient(stringSession, Number(bot.apiId), bot.apiHash, { connectionRetries: 5, retryDelay: 2000 });
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
            const text = message.text?.toLowerCase() ?? "";
            const chatId = message.chatId?.toString();
            if (!chatId)
                return;
            const sender = (await message.getSender());
            const telegramUserId = sender?.id?.toString();
            const isPrivateChat = !chatId.startsWith("-");
            if (!isPrivateChat)
                return;
            if (telegramUserId) {
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
            }
        }, new events_1.NewMessage({}));
        client.addEventHandler(async (event) => {
            try {
                const className = event?.className || event?.constructor?.name;
                const data = event.data?.toString("utf8") ?? "";
                const chatId = event.query?.peer
                    ? (await client.getEntity(event.query.peer))?.id?.toString()
                    : event.chatId?.toString();
                if (!chatId)
                    return;
                this.logger.debug(`[callback] data="${data}" chatId=${chatId}`);
                const botToken = this.businessBotTokens.get(bot.id);
                const businessConnectionId = this.getBusinessConnectionId(bot.id, chatId);
                const sendPix = async (text) => {
                    if (botToken && businessConnectionId) {
                        await this.sendMessageHttp(botToken, parseInt(chatId), text, {
                            business_connection_id: businessConnectionId,
                            parse_mode: "MarkdownV2",
                        });
                    }
                    else {
                        await client.sendMessage(chatId, {
                            message: text,
                            parseMode: "md",
                        });
                    }
                };
                const sendMarkdown = async (text, extra) => {
                    if (botToken && businessConnectionId) {
                        await this.sendMessageHttp(botToken, parseInt(chatId), text, {
                            business_connection_id: businessConnectionId,
                            parse_mode: "Markdown",
                            ...extra,
                        });
                    }
                    else {
                        await client.sendMessage(chatId, {
                            message: text,
                            parseMode: "md",
                        });
                    }
                };
                if (data === "list_products") {
                    const products = await this.prisma.product.findMany({
                        where: { isActive: true },
                        orderBy: { priceCents: "asc" },
                    });
                    if (products.length === 0) {
                        await sendMarkdown("😔 Nenhum produto disponível no momento.");
                        return;
                    }
                    const inlineKeyboard = products.map((p) => [
                        {
                            text: `${p.title} — R$ ${(p.priceCents / 100).toFixed(2).replace(".", ",")}`,
                            callback_data: `buy:${p.id}`,
                        },
                    ]);
                    await sendMarkdown("🛍️ *Escolha o produto:*", {
                        reply_markup: { inline_keyboard: inlineKeyboard },
                    });
                    return;
                }
                if (data.startsWith("buy:")) {
                    const productId = data.split(":")[1];
                    const product = await this.prisma.product.findUnique({
                        where: { id: productId },
                    });
                    if (!product) {
                        await sendMarkdown("❌ Produto não encontrado.");
                        return;
                    }
                    await sendMarkdown(`⏳ Gerando PIX para *${product.title}*\.\.\.`);
                    const pixData = await this.syncPayService.createCharge({
                        amountCents: product.priceCents,
                        productTitle: product.title,
                        referenceId: chatId,
                    });
                    const price = (product.priceCents / 100)
                        .toFixed(2)
                        .replace(".", ",");
                    const escape = (s) => s.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\$&");
                    const pixMsg = [
                        `✅ *PIX gerado com sucesso\!*`,
                        ``,
                        `🏷️ *${escape(product.title)}*`,
                        `💰 Valor: *R\$ ${price.replace(".", "\.")}*`,
                        ``,
                        `📋 *Copia e Cola:*`,
                        `\`${pixData.pix_code}\``,
                        ``,
                        `⏰ Válido por 30 minutos`,
                        ``,
                        `Após o pagamento você receberá a confirmação automaticamente\.`,
                    ].join("\n");
                    await sendPix(pixMsg);
                    return;
                }
                if (data === "support") {
                    await sendMarkdown("🙋 Nossa equipe entrará em contato em breve\!");
                    return;
                }
            }
            catch (err) {
                this.logger.error(`Erro no callback handler:`, err);
            }
        });
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
        const { client, phoneCodeHash } = temp;
        try {
            await client.invoke(new telegram_1.Api.auth.SignIn({
                phoneNumber,
                phoneCodeHash: phoneCodeHash,
                phoneCode: code,
            }));
            return await this._finalizeLogin(botId, client);
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
        this.logger.debug(`[sendTemplate] templateId=${template.id} type=${template.type}`);
        this.logger.debug(`[sendTemplate] mediaUrl=${template.mediaUrl}`);
        this.logger.debug(`[sendTemplate] mediaItems=${JSON.stringify(template.mediaItems)}`);
        try {
            if (template.type === "TEXT") {
                await client.sendMessage(chatId, {
                    message: template.text || "",
                });
                return;
            }
            if (template.type === "COMBO" && template.mediaItems?.length > 0) {
                const sortedMedia = [...template.mediaItems].sort((a, b) => a.order - b.order);
                if (template.text) {
                    await client.sendMessage(chatId, {
                        message: template.text,
                    });
                    await new Promise((r) => setTimeout(r, 300));
                }
                const peer = await client.getInputEntity(chatId);
                const readyItems = [];
                for (let i = 0; i < sortedMedia.length; i++) {
                    const item = sortedMedia[i];
                    const meta = this.getMediaMeta(item.url);
                    const filename = `file_${i}.${meta.ext}`;
                    this.logger.debug(`[COMBO item ${i}] ext=${meta.ext} isVideo=${meta.isVideo} isImage=${meta.isImage}`);
                    const fileBuffer = await this.fetchFileBuffer(item.url);
                    const uploadedFile = await this.uploadFromBuffer(client, filename, fileBuffer);
                    const uploadedMedia = this.buildInputMedia(uploadedFile, meta, filename, true);
                    const serverMedia = await client.invoke(new telegram_1.Api.messages.UploadMedia({
                        peer,
                        media: uploadedMedia,
                    }));
                    let finalMedia;
                    if (serverMedia instanceof telegram_1.Api.MessageMediaPhoto &&
                        serverMedia.photo) {
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
                    this.logger.debug(`[COMBO item ${i}] UploadMedia OK -> ${finalMedia.className}`);
                    readyItems.push({
                        finalMedia,
                        isImage: meta.isImage,
                        isVideo: meta.isVideo,
                        isAudio: meta.isAudio,
                    });
                }
                let imageQueue = [];
                const flushImages = async () => {
                    if (imageQueue.length === 0)
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
                return;
            }
            const mediaUrl = template.mediaUrl || "";
            const meta = this.getMediaMeta(mediaUrl);
            const filename = `file.${meta.ext}`;
            this.logger.debug(`[sendTemplate] single media: url=${mediaUrl} ext=${meta.ext} mimeType=${meta.mimeType} isVideo=${meta.isVideo} isAudio=${meta.isAudio} isImage=${meta.isImage}`);
            const fileBuffer = await this.fetchFileBuffer(mediaUrl);
            this.logger.debug(`[sendTemplate] buffer size=${fileBuffer.length}`);
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
        catch (error) {
            this.logger.error(`Error sending template to ${chatId} via bot ${botId}:`, error);
            throw error;
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