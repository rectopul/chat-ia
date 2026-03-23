// src/telegram/processors/transfer.processor.ts
//
// Worker BullMQ para processar transferências de usuários entre grupos.
// Implementa rate limiting agressivo para evitar banimentos do Telegram.

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import { Api } from "telegram";
import bigInt from "big-integer";
import { PrismaService } from "../../prisma/prisma.service";
import { MtprotoProvider } from "../providers/mtproto.provider";
import { GroupScraperService } from "../services/group-scraper.service";
import {
    ScrapeGroupJobData,
    TransferUserJobData,
} from "../interfaces/scraping.interfaces";
import {
    TRANSFER_QUEUE_NAME,
    SCRAPE_GROUP_JOB,
    TRANSFER_USER_JOB,
    TRANSFER_DELAYS,
} from "../constants";
import { TransferStatus } from "@prisma/client";

@Processor(TRANSFER_QUEUE_NAME, {
    concurrency: 1, // CRÍTICO: apenas 1 worker por vez para respeitar rate limits
})
export class TransferProcessor extends WorkerHost {
    private readonly logger = new Logger(TransferProcessor.name);

    // Contador de transferências nas últimas 24h (por botId)
    private dailyTransferCount = new Map<string, number>();
    private lastResetTime = new Map<string, number>();
    private floodWaitMap = new Map<string, number>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly mtproto: MtprotoProvider,
        private readonly scraperService: GroupScraperService,
    ) {
        super();
    }

    // ── Router ────────────────────────────────────────────────────────────

    async process(job: Job<any>): Promise<any> {
        this.logger.debug(
            `[processor] job=${job.name} id=${job.id} attempt=${job.attemptsMade + 1}`,
        );

        switch (job.name) {
            case SCRAPE_GROUP_JOB:
                return this.processScraping(job as Job<ScrapeGroupJobData>);
            case TRANSFER_USER_JOB:
                return this.processTransfer(job as Job<TransferUserJobData>);
            default:
                throw new Error(`Job desconhecido: ${job.name}`);
        }
    }

    // ── Scraping ──────────────────────────────────────────────────────────

    private async processScraping(job: Job<ScrapeGroupJobData>): Promise<void> {
        await this.scraperService.executeScraping(job.data);
    }

    // ── Transfer ──────────────────────────────────────────────────────────

    private async processTransfer(
        job: Job<TransferUserJobData>,
    ): Promise<void> {
        const {
            botId,
            jobId,
            scrapedUserId,
            userId,
            username,
            targetGroupId,
            attemptNumber,
        } = job.data;

        // Verifica limite diário
        if (!this.canTransferToday(botId)) {
            this.logger.warn(
                `[processTransfer] Limite diário atingido para bot ${botId}`,
            );
            await job.moveToDelayed(
                Date.now() + 24 * 60 * 60 * 1000,
                job.token,
            );
            return;
        }

        const floodUntil = this.floodWaitMap.get(botId);

        if (floodUntil && floodUntil > Date.now()) {
            const delay = floodUntil - Date.now();

            this.logger.warn(
                `[processTransfer] ⏸️ Bot em flood (${botId}), aguardando ${Math.round(delay / 1000)}s`,
            );

            await job.moveToDelayed(delay, job.token);
            return;
        }

        const client = this.mtproto.getClient(botId);
        if (!client) {
            throw new Error(`MTProto client não encontrado para bot ${botId}`);
        }

        try {
            await this.prisma.userTransfer.updateMany({
                where: { userId },
                data: {
                    attempts: { increment: 1 },
                    lastAttemptAt: new Date(),
                },
            });

            // Tenta adicionar o usuário ao grupo
            await this.addUserToGroup(client, userId, username, targetGroupId);

            // Sucesso!
            await this.prisma.userTransfer.updateMany({
                where: { userId },
                data: {
                    status: "TRANSFERRED",
                    transferredAt: new Date(),
                },
            });

            await this.prisma.groupScrapingJob.update({
                where: { id: jobId },
                data: { transferredUsers: { increment: 1 } },
            });

            this.incrementDailyCount(botId);

            const delay =
                (Math.random() *
                    (TRANSFER_DELAYS.MAX_SECONDS -
                        TRANSFER_DELAYS.MIN_SECONDS) +
                    TRANSFER_DELAYS.MIN_SECONDS) *
                1000;

            await new Promise((resolve) => setTimeout(resolve, delay));

            this.logger.log(
                `[processTransfer] ✅ Usuário ${userId} adicionado ao grupo ${targetGroupId}`,
            );
        } catch (err: any) {
            await this.handleTransferError(err, scrapedUserId, jobId, job);
        }
    }

    // ── Adiciona usuário ao grupo ────────────────────────────────────────

    private async addUserToGroup(
        client: any,
        userId: string,
        username: string | undefined,
        targetGroupId: string,
    ): Promise<void> {
        try {
            const targetEntity = await client.getEntity(targetGroupId);

            // Tenta adicionar por username primeiro (mais confiável)
            if (username) {
                try {
                    await client.invoke(
                        new Api.channels.InviteToChannel({
                            channel: targetEntity,
                            users: [username],
                        }),
                    );
                    return;
                } catch (usernameErr: any) {
                    this.logger.warn(
                        `[addUserToGroup] Falha por username, tentando por ID: ${usernameErr?.message}`,
                    );
                }
            }

            // Fallback: tenta por ID
            const userEntity = await client.getEntity(bigInt(userId));
            await client.invoke(
                new Api.channels.InviteToChannel({
                    channel: targetEntity,
                    users: [userEntity],
                }),
            );
        } catch (err: any) {
            this.logger.error(
                `[addUserToGroup] Erro ao adicionar ${userId}:`,
                err,
            );
            throw err;
        }
    }

    // ── Tratamento de erros ──────────────────────────────────────────────

    private async handleTransferError(
        err: any,
        scrapedUserId: string,
        jobId: string,
        job: Job<TransferUserJobData>,
    ): Promise<void> {
        const errorMessage =
            err?.errorMessage || err?.message || "Erro desconhecido";

        this.logger.error(
            `[handleTransferError] ${job.data.userId}: ${errorMessage}`,
        );

        let status: TransferStatus = TransferStatus.FAILED;
        let floodWaitUntil: Date | undefined;

        // ── FloodWaitError ────────────────────────────────────────────────
        if (
            errorMessage.includes("FLOOD_WAIT") ||
            errorMessage.includes("A wait of")
        ) {
            let waitSeconds = 3600;

            // Caso 1: FLOOD_WAIT_XXX
            const floodMatch = errorMessage.match(/FLOOD_WAIT_(\d+)/);
            if (floodMatch) {
                waitSeconds = parseInt(floodMatch[1]);
            }

            // Caso 2: A wait of XXX seconds
            const waitMatch = errorMessage.match(/A wait of (\d+) seconds/);
            if (waitMatch) {
                waitSeconds = parseInt(waitMatch[1]);
            }

            const bufferSeconds = TRANSFER_DELAYS.FLOOD_WAIT_BUFFER;

            floodWaitUntil = new Date(
                Date.now() + (waitSeconds + bufferSeconds) * 1000,
            );

            status = TransferStatus.FLOOD_WAIT;

            this.logger.warn(
                `[handleTransferError] ⏸️ FloodWait: ${waitSeconds}s`,
            );

            await job.moveToDelayed(
                (waitSeconds + bufferSeconds) * 1000,
                job.token,
            );

            this.floodWaitMap.set(
                job.data.botId,
                Date.now() + (waitSeconds + bufferSeconds) * 1000,
            );

            return;
        }
        // ── UserPrivacyRestrictedError ───────────────────────────────────
        else if (
            errorMessage.includes("USER_PRIVACY_RESTRICTED") ||
            errorMessage.includes("USER_CHANNELS_TOO_MUCH")
        ) {
            status = "USER_PRIVACY";
            this.logger.warn(
                `[handleTransferError] 🔒 Privacidade do usuário ${job.data.userId}`,
            );
        }
        // ── UserAlreadyParticipantError ──────────────────────────────────
        else if (errorMessage.includes("USER_ALREADY_PARTICIPANT")) {
            status = "ALREADY_PARTICIPANT";
            this.logger.debug(
                `[handleTransferError] ℹ️  Usuário ${job.data.userId} já está no grupo`,
            );
        }
        // ── PeerFloodError (banimento temporário) ────────────────────────
        else if (errorMessage.includes("PEER_FLOOD")) {
            status = TransferStatus.FLOOD_WAIT;
            floodWaitUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

            this.logger.error(
                `[handleTransferError] 🚨 PEER_FLOOD detectado! Pausando por 24h`,
            );

            await job.moveToDelayed(
                floodWaitUntil.getTime() - Date.now(),
                job.token,
            );
        }

        // Atualiza no banco
        await this.prisma.userTransfer.updateMany({
            where: { id: scrapedUserId }, // Se não achar, o worker não quebra
            data: {
                status,
                error: errorMessage.substring(0, 500),
                floodWaitUntil,
            },
        });

        // Para o contador de falhas do Job Pai, o JobId precisa estar correto
        await this.prisma.groupScrapingJob
            .update({
                where: { id: jobId },
                data: { failedUsers: { increment: 1 } },
            })
            .catch(() =>
                this.logger.error(
                    `Job pai ${jobId} não encontrado para incrementar falha`,
                ),
            );
    }

    // ── Rate limiting helpers ─────────────────────────────────────────────

    private canTransferToday(botId: string): boolean {
        const now = Date.now();
        const lastReset = this.lastResetTime.get(botId) || 0;

        // Reset diário
        if (now - lastReset > 24 * 60 * 60 * 1000) {
            this.dailyTransferCount.set(botId, 0);
            this.lastResetTime.set(botId, now);
        }

        const count = this.dailyTransferCount.get(botId) || 0;
        return count < TRANSFER_DELAYS.DAILY_LIMIT;
    }

    private incrementDailyCount(botId: string): void {
        const current = this.dailyTransferCount.get(botId) || 0;
        this.dailyTransferCount.set(botId, current + 1);
    }
}
