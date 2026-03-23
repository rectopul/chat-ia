// app/scraping/_lib/api.ts

import {
    StartScrapingRequest,
    StartScrapingResponse,
    ScrapingProgress,
    ScrapingJob,
} from "./types";

const API_BASE_URL = process.env.API_URL || "http://localhost:3001";

export class ScrapingAPI {
    /**
     * Inicia um novo job de scraping
     */
    static async startScraping(
        data: StartScrapingRequest,
    ): Promise<StartScrapingResponse> {
        const response = await fetch(`${API_BASE_URL}/telegram/scraper/start`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao iniciar scraping");
        }

        return response.json();
    }

    /**
     * Busca o progresso de um job específico
     */
    static async getProgress(jobId: string): Promise<ScrapingProgress> {
        const response = await fetch(
            `${API_BASE_URL}/telegram/scraper/progress/${jobId}`,
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao buscar progresso");
        }

        return response.json();
    }

    /**
     * Lista todos os jobs de scraping
     */
    static async getJobs(botId?: string): Promise<ScrapingJob[]> {
        const url = new URL(`${API_BASE_URL}/telegram/scraper/jobs`);
        if (botId) {
            url.searchParams.append("botId", botId);
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao buscar jobs");
        }

        return response.json();
    }

    /**
     * Retenta transferências falhadas de um job
     */
    static async retryFailed(
        jobId: string,
    ): Promise<{ retried: number; message: string }> {
        const response = await fetch(
            `${API_BASE_URL}/telegram/scraper/retry/${jobId}`,
            {
                method: "POST",
            },
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Erro ao retentar transferências");
        }

        return response.json();
    }
}
