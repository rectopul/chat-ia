import { TemplateService } from "./template.service";
import { UserSegment } from "@prisma/client";
export declare class TemplateController {
    private readonly templateService;
    constructor(templateService: TemplateService);
    send(body: {
        botId: string;
        chatId: string;
        templateId: string;
    }): Promise<{
        success: boolean;
    }>;
    schedule(body: {
        botId: string;
        telegramUserId: string;
        chatId: string;
        segment: UserSegment;
    }): Promise<{
        success: boolean;
        jobsCreated: number;
    }>;
    processJobs(secret: string): Promise<{
        processed: number;
        failed: number;
        success: boolean;
    }>;
}
