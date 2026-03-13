import { PrismaService } from "../prisma/prisma.service";
import { TelegramService } from "../telegram/telegram.service";
import { UserSegment } from "@prisma/client";
export declare class TemplateService {
    private readonly prisma;
    private readonly telegram;
    private readonly logger;
    constructor(prisma: PrismaService, telegram: TelegramService);
    sendTemplate(botId: string, chatId: string, templateId: string): Promise<void>;
    scheduleCampaignsForUser(botId: string, telegramUserId: string, chatId: string, segment: UserSegment): Promise<number>;
    processScheduledJobs(): Promise<{
        processed: number;
        failed: number;
    }>;
}
