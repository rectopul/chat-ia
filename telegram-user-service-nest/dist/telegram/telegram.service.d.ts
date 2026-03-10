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
    private fetchFileBuffer;
    private getMediaMeta;
    private uploadFromBuffer;
    private makeRandomId;
    private buildInputMedia;
    private sendMessageHttp;
    private answerCallbackQuery;
    private send;
    initBusinessBot(botId: string, token: string): Promise<void>;
    getBusinessConnectionId(botId: string, userTelegramId: string): string | undefined;
    sendBusinessMessageWithKeyboard(botId: string, businessConnectionId: string, recipientChatId: string | number, text: string, keyboard: string[][]): Promise<void>;
    sendKeyboardAsBusinessUser(botId: string, ownerTelegramId: string, recipientChatId: string | number, text: string, keyboard: string[][]): Promise<void>;
    private initClient;
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
}
