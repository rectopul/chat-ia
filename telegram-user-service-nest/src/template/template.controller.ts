// template/template.controller.ts
import {
    Body,
    Controller,
    Post,
    HttpCode,
    Headers,
    UnauthorizedException,
} from "@nestjs/common";
import { TemplateService } from "./template.service";
import { UserSegment } from "@prisma/client";

@Controller("templates")
export class TemplateController {
    constructor(private readonly templateService: TemplateService) {}

    /**
     * Envia um template imediatamente para um chat.
     * POST /templates/send
     * Body: { botId, chatId, templateId }
     */
    @Post("send")
    @HttpCode(200)
    async send(
        @Body() body: { botId: string; chatId: string; templateId: string },
    ) {
        await this.templateService.sendTemplate(
            body.botId,
            body.chatId,
            body.templateId,
        );
        return { success: true };
    }

    /**
     * Agenda campanhas para um usuário com base no segmento.
     * POST /templates/schedule
     * Body: { botId, telegramUserId, chatId, segment }
     */
    @Post("schedule")
    @HttpCode(200)
    async schedule(
        @Body()
        body: {
            botId: string;
            telegramUserId: string;
            chatId: string;
            segment: UserSegment;
        },
    ) {
        const count = await this.templateService.scheduleCampaignsForUser(
            body.botId,
            body.telegramUserId,
            body.chatId,
            body.segment,
        );
        return { success: true, jobsCreated: count };
    }

    /**
     * Processa jobs pendentes. Chamado externamente por um cron (Vercel, Railway, etc).
     * POST /templates/process-jobs
     * Header: x-cron-secret: <CRON_SECRET>
     *
     * Protegido por secret para evitar chamadas não autorizadas.
     * Configure CRON_SECRET no .env do NestJS.
     */
    @Post("process-jobs")
    @HttpCode(200)
    async processJobs(@Headers("x-cron-secret") secret: string) {
        const expected = process.env.CRON_SECRET;
        if (expected && secret !== expected) {
            throw new UnauthorizedException("Invalid cron secret.");
        }

        const result = await this.templateService.processScheduledJobs();
        return { success: true, ...result };
    }
}
