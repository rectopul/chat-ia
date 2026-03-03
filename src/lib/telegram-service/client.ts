import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { prisma } from "@/lib/prisma";
import { MediaType } from "@prisma/client";

export class TelegramUserClient {
  private client: TelegramClient | null = null;
  private botId: string;

  constructor(botId: string) {
    this.botId = botId;
  }

  async init() {
    const bot = await prisma.botAccount.findUnique({ where: { id: this.botId } });
    if (!bot || !bot.isUserAccount) throw new Error("Not a user account");

    const stringSession = new StringSession(bot.session || "");
    this.client = new TelegramClient(stringSession, bot.apiId!, bot.apiHash!, {
      connectionRetries: 5,
    });

    await this.client.connect();
  }

  async sendMessage(chatId: string, text: string) {
    if (!this.client) await this.init();
    await this.client!.sendMessage(chatId, { message: text });
  }

  async sendFile(chatId: string, url: string, caption?: string) {
    if (!this.client) await this.init();
    await this.client!.sendFile(chatId, { file: url, caption });
  }

  async sendTemplate(chatId: string, template: any) {
    if (template.type === MediaType.COMBO && template.mediaItems) {
        if (template.text) await this.sendMessage(chatId, template.text);
        const sortedMedia = [...template.mediaItems].sort((a, b) => a.order - b.order);
        for (const item of sortedMedia) {
            await this.sendFile(chatId, item.url);
            await new Promise(r => setTimeout(r, 1000));
        }
        return;
    }

    if (template.type === MediaType.TEXT) {
        await this.sendMessage(chatId, template.text || "");
    } else {
        await this.sendFile(chatId, template.mediaUrl || "", template.text || undefined);
    }
  }

  // Auto-atendimento logic
  async startAutoResponse() {
    if (!this.client) await this.init();
    this.client!.addEventHandler(async (event: any) => {
        const message = event.message;
        if (message && message.isOut) return;

        const text = message.message?.toLowerCase();
        const chatId = message.chatId.toString();

        if (text === "/start" || text === "oi" || text === "ola") {
            await this.sendMessage(chatId, "Olá! Sou seu assistente automático. Como posso ajudar?");
        }
    });
  }
}
