import axios from "axios";

const TELEGRAM_SERVICE_URL = process.env.TELEGRAM_SERVICE_URL || "http://localhost:3001";
const TELEGRAM_SERVICE_SECRET = process.env.TELEGRAM_SERVICE_SECRET;

export class TelegramUserClient {
  private botId: string;

  constructor(botId: string) {
    this.botId = botId;
  }

  async sendTemplate(chatId: string, template: any) {
    try {
        await axios.post(`${TELEGRAM_SERVICE_URL}/telegram/send`, {
            botId: this.botId,
            chatId,
            template,
            secret: TELEGRAM_SERVICE_SECRET
        });
    } catch (error: any) {
        console.error("Error calling NestJS Telegram Service:", error.response?.data || error.message);
        throw error;
    }
  }

  // Auto-atendimento will now be handled by the NestJS service directly
  // after it initializes the clients.
}
