import { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SyncPayService } from "../syncpay/syncpay.service";
export declare class TelegramService implements OnModuleInit, OnModuleDestroy {
    private readonly prisma;
    private readonly syncPayService;
    private readonly logger;
    private clients;
    private tempClients;
    private businessBots;
    private businessBotTokens;
    private businessConnections;
    constructor(prisma: PrismaService, syncPayService: SyncPayService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private getMediaMeta;
    private convertToOggOpus;
    private fetchFileBuffer;
    private uploadFromBuffer;
    private makeRandomId;
    private buildInputMedia;
    private prepareMedia;
    private sendPixAudio;
    private buildPixMessage;
    private sendMessageHttp;
    private answerCallbackQuery;
    private send;
    private resolveBusinessConnectionId;
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
    private initClient;
    sendBusinessMessageWithKeyboard(botId: string, businessConnectionId: string, recipientChatId: string | number, text: string, keyboard: string[][]): Promise<void>;
    sendKeyboardAsBusinessUser(botId: string, ownerTelegramId: string, recipientChatId: string | number, text: string, keyboard: string[][]): Promise<void>;
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
    sendTemplate(botId: string, chatId: string, template: any): Promise<void>;
    private sendCombo;
    private sendSingleMedia;
}
