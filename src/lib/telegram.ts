import axios from "axios";
import { prisma } from "./prisma";
import { MediaType, MessageDirection } from "@prisma/client";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export class TelegramService {
  private static getApiUrl(token?: string) {
    return `https://api.telegram.org/bot${token || TELEGRAM_BOT_TOKEN}`;
  }

  private static async logMessage(params: {
    botId?: string;
    telegramUserId: string;
    direction: MessageDirection;
    type: MediaType;
    text?: string;
    mediaUrl?: string;
    providerMessageId?: string;
  }) {
    try {
        if (!params.botId) return; // Cannot log without botId in new schema
      await prisma.messageLog.create({
        data: {
            botId: params.botId,
            telegramUserId: params.telegramUserId,
            direction: params.direction,
            type: params.type,
            text: params.text,
            mediaUrl: params.mediaUrl,
            providerMessageId: params.providerMessageId
        },
      });
    } catch (error) {
      console.error("Error logging message:", error);
    }
  }

  static async sendText(chatId: string, text: string, telegramUserId: string, botId?: string, token?: string) {
    try {
      const response = await axios.post(`${this.getApiUrl(token)}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      });

      await this.logMessage({
        botId,
        telegramUserId,
        direction: MessageDirection.OUT,
        type: MediaType.TEXT,
        text,
        providerMessageId: response.data.result.message_id.toString(),
      });

      return response.data;
    } catch (error) {
      console.error("Error sending text to Telegram:", error);
      throw error;
    }
  }

  static async sendPhoto(
    chatId: string,
    photoUrl: string,
    telegramUserId: string,
    caption?: string,
    botId?: string,
    token?: string
  ) {
    try {
      const response = await axios.post(`${this.getApiUrl(token)}/sendPhoto`, {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      });

      await this.logMessage({
        botId,
        telegramUserId,
        direction: MessageDirection.OUT,
        type: MediaType.IMAGE,
        text: caption,
        mediaUrl: photoUrl,
        providerMessageId: response.data.result.message_id.toString(),
      });

      return response.data;
    } catch (error) {
      console.error("Error sending photo to Telegram:", error);
      throw error;
    }
  }

  static async sendVideo(
    chatId: string,
    videoUrl: string,
    telegramUserId: string,
    caption?: string,
    botId?: string,
    token?: string
  ) {
    try {
      const response = await axios.post(`${this.getApiUrl(token)}/sendVideo`, {
        chat_id: chatId,
        video: videoUrl,
        caption,
        parse_mode: "HTML",
      });

      await this.logMessage({
        botId,
        telegramUserId,
        direction: MessageDirection.OUT,
        type: MediaType.VIDEO,
        text: caption,
        mediaUrl: videoUrl,
        providerMessageId: response.data.result.message_id.toString(),
      });

      return response.data;
    } catch (error) {
      console.error("Error sending video to Telegram:", error);
      throw error;
    }
  }

  static async sendMessageTemplate(
    chatId: string,
    telegramUserId: string,
    template: any,
    botId?: string,
    token?: string
  ) {
    if (template.type === MediaType.COMBO && template.mediaItems) {
      if (template.text) {
        await this.sendText(chatId, template.text, telegramUserId, botId, token);
      }

      const sortedMedia = [...template.mediaItems].sort((a, b) => a.order - b.order);

      for (const item of sortedMedia) {
        if (item.type === MediaType.IMAGE) {
          await this.sendPhoto(chatId, item.url, telegramUserId, undefined, botId, token);
        } else if (item.type === MediaType.VIDEO) {
          await this.sendVideo(chatId, item.url, telegramUserId, undefined, botId, token);
        }
        // Basic delay to respect rate limits and order
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return;
    }

    switch (template.type) {
      case MediaType.TEXT:
        return this.sendText(chatId, template.text || "", telegramUserId, botId, token);
      case MediaType.IMAGE:
        return this.sendPhoto(
          chatId,
          template.mediaUrl || "",
          telegramUserId,
          template.text || undefined,
          botId,
          token
        );
      case MediaType.VIDEO:
        return this.sendVideo(
          chatId,
          template.mediaUrl || "",
          telegramUserId,
          template.text || undefined,
          botId,
          token
        );
      default:
        throw new Error(`Unsupported media type: ${template.type}`);
    }
  }
}
