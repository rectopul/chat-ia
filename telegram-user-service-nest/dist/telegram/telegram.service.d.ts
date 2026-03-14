import { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SyncPayService } from "../syncpay/syncpay.service";
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
export declare class TelegramService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly syncPayService;
    private readonly logger;
    private clients;
    private tempClients;
    private businessBots;
    private businessBotTokens;
    private businessConnections;
    private chatConnectionMap;
    constructor(prisma: PrismaService, syncPayService: SyncPayService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private getMediaMeta;
    private convertToOggOpus;
    private fetchFileBuffer;
    private uploadFromBuffer;
    private makeRandomId;
    private getAudioDuration;
    private buildInputMedia;
    private prepareMedia;
    private sendPixAudio;
    getBusinessBotToken(botId: string): string | undefined;
    sendDontSellMenu(botId: string, chatId: string | number, token: string, businessConnectionId: string): Promise<void>;
    private scheduleDontSellJobs;
    private buildPixMessage;
    private sendMessageHttp;
    private answerCallbackQuery;
    private send;
    private resolveConnectionForChat;
    getBusinessConnectionId(botId: string, userTelegramId: string): string | undefined;
    initBusinessBot(botId: string, token: string): Promise<void>;
    private registerBusinessConnectionHandler;
    private registerBusinessMessageHandler;
    private handleGreeting;
    private scheduleDontSell;
    private registerCallbackQueryHandler;
    private handleListProducts;
    private handleBuy;
    private handleBuyDiscount;
    sendBusinessMessageWithKeyboard(botId: string, businessConnectionId: string, recipientChatId: string | number, text: string, keyboard: string[][]): Promise<void>;
    sendKeyboardAsBusinessUser(botId: string, ownerTelegramId: string, recipientChatId: string | number, text: string, keyboard: string[][]): Promise<void>;
    getBotStatus(): Promise<BotStatusResponse>;
    sendCode(botId: string, phoneNumber: string): Promise<{
        message: string;
    }>;
    verifyCode(botId: string, phoneNumber: string, code: string): Promise<{
        success: boolean;
        requires2FA?: boolean;
        session?: string;
    }>;
    verifyPassword(botId: string, password: string): Promise<{
        success: boolean;
        session?: string;
    }>;
    private _finalizeLogin;
    private initClient;
    sendTemplate(botId: string, chatId: string, template: any, businessCtx?: {
        token: string;
        businessConnectionId: string;
        botId: string;
    }): Promise<void>;
    private saveFileId;
    private sendTemplateViaBotApi;
    private sendCombo;
    private sendSingleMedia;
}
