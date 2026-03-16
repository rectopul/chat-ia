import { TelegramService } from "./services/telegram.service";
import { BotStatusResponse } from "./interfaces";
export declare class TelegramController {
    private readonly telegramService;
    constructor(telegramService: TelegramService);
    send(body: any): Promise<{
        ok: boolean;
    }>;
    sendCode(body: any): Promise<{
        ok: boolean;
    }>;
    verifyCode(body: any): Promise<{
        success: boolean;
        requires2FA?: boolean;
        session?: string;
    }>;
    verifyPassword(body: {
        botId: string;
        password: string;
    }): Promise<{
        success: boolean;
        session?: string;
    }>;
    registerBusinessBot(body: {
        botId: string;
        token: string;
    }): Promise<{
        message: string;
    }>;
    getBotStatus(): Promise<BotStatusResponse>;
    confirmPayment(body: {
        saleId: string;
    }): Promise<any>;
}
