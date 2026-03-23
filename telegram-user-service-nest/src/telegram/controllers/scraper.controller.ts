// src/telegram/controllers/scraper.controller.ts
//
// Endpoints HTTP para gerenciamento de scraping e transferência de usuários.

import {
    Controller,
    Post,
    Get,
    Body,
    Param,
    Query,
    HttpCode,
} from "@nestjs/common";
import { GroupScraperService } from "../services/group-scraper.service";
import { ScrapingProgress } from "../interfaces/scraping.interfaces";

@Controller("telegram/scraper")
export class ScraperController {
    constructor(private readonly scraperService: GroupScraperService) {}

    /**
     * POST /telegram/scraper/start
     *
     * Inicia scraping de um grupo público e enfileira transferências.
     *
     * Body:
     * {
     *   "botId": "bot_123",
     *   "sourceGroupId": "@grupopublico" ou "1234567890",
     *   "targetGroupId": "1234567890"
     * }
     */
    @Post("start")
    @HttpCode(200)
    async startScraping(
        @Body()
        body: {
            botId: string;
            sourceGroupId: string;
            targetGroupId: string;
        },
    ): Promise<{ jobId: string; message: string }> {
        return this.scraperService.startScraping(
            body.botId,
            body.sourceGroupId,
            body.targetGroupId,
        );
    }

    /**
     * GET /telegram/scraper/jobs?botId=xxx
     *
     * Lista todos os jobs de scraping (últimos 50).
     * Query params:
     * - botId (opcional): filtra por bot
     */
    @Get("jobs")
    async listJobs(
        @Query("botId") botId?: string,
    ): Promise<ScrapingProgress[]> {
        return this.scraperService.listJobs(botId);
    }

    /**
     * GET /telegram/scraper/progress/:jobId
     *
     * Consulta progresso de um job específico.
     */
    @Get("progress/:jobId")
    async getProgress(
        @Param("jobId") jobId: string,
    ): Promise<ScrapingProgress> {
        return this.scraperService.getProgress(jobId);
    }

    /**
     * POST /telegram/scraper/retry/:jobId
     *
     * Retenta transferências falhadas de um job.
     */
    @Post("retry/:jobId")
    @HttpCode(200)
    async retryFailed(
        @Param("jobId") jobId: string,
    ): Promise<{ retried: number; message: string }> {
        const result = await this.scraperService.retryFailed(jobId);
        return {
            retried: result.retried,
            message: `${result.retried} transferências reenfileiradas`,
        };
    }
}
