import axios from "axios";
import { prisma } from "./prisma";
import { MediaType, MessageDirection } from "@prisma/client";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export class TelegramService {
  private static async logMessage(params: {
    telegramUserId: string;
    direction: MessageDirection;
    type: MediaType;
    text?: string;
    mediaUrl?: string;
    providerMessageId?: string;
  }) {
    try {
      await prisma.messageLog.create({
        data: params,
      });
    } catch (error) {
      console.error("Error logging message:", error);
    }
  }

  static async sendText(chatId: string, text: string, telegramUserId: string) {
    try {
      const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      });

      await this.logMessage({
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
    caption?: string
  ) {
    try {
      const response = await axios.post(`${TELEGRAM_API_URL}/sendPhoto`, {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      });

      await this.logMessage({
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
    caption?: string
  ) {
    try {
      const response = await axios.post(`${TELEGRAM_API_URL}/sendVideo`, {
        chat_id: chatId,
        video: videoUrl,
        caption,
        parse_mode: "HTML",
      });

      await this.logMessage({
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
    template: any // Using any to support enriched includes
  ) {
    if (template.type === MediaType.COMBO && template.mediaItems) {
      if (template.text) {
        await this.sendText(chatId, template.text, telegramUserId);
      }

      const sortedMedia = [...template.mediaItems].sort((a, b) => a.order - b.order);

      for (const item of sortedMedia) {
        if (item.type === MediaType.IMAGE) {
          await this.sendPhoto(chatId, item.url, telegramUserId);
        } else if (item.type === MediaType.VIDEO) {
          await this.sendVideo(chatId, item.url, telegramUserId);
        }
        // Basic delay to respect rate limits and order
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return;
    }

    switch (template.type) {
      case MediaType.TEXT:
        return this.sendText(chatId, template.text || "", telegramUserId);
      case MediaType.IMAGE:
        return this.sendPhoto(
          chatId,
          template.mediaUrl || "",
          telegramUserId,
          template.text || undefined
        );
      case MediaType.VIDEO:
        return this.sendVideo(
          chatId,
          template.mediaUrl || "",
          telegramUserId,
          template.text || undefined
        );
      default:
        throw new Error(`Unsupported media type: ${template.type}`);
    }
  }
}
