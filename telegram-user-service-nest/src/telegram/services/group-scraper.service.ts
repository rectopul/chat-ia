// src/telegram/services/group-scraper.service.ts
//
// Responsabilidade única: extração de membros de grupos públicos
// e orquestração de transferências para outro grupo.

import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { TelegramClient, Api } from "telegram";
import { PrismaService } from "../../prisma/prisma.service";
import { MtprotoProvider } from "../providers/mtproto.provider";
import {
    ScrapeGroupJobData,
    TransferUserJobData,
    ScrapingProgress,
    TransferStats,
} from "../interfaces/scraping.interfaces";
import {
    TRANSFER_QUEUE_NAME,
    SCRAPE_GROUP_JOB,
    TRANSFER_USER_JOB,
    TRANSFER_DELAYS,
} from "../constants";

@Injectable()
export class GroupScraperService {
    private readonly logger = new Logger(GroupScraperService.name);

    // ✅ CONFIGURAÇÃO DE DISTRIBUIÇÃO TEMPORAL
    // Controla ao longo de quanto tempo os jobs serão distribuídos
    // para evitar flood do Telegram e respeitar rate limits.
    private readonly DISTRIBUTION_HOURS = 24; // Distribuir ao longo de 24h
    private readonly RETRY_DISTRIBUTION_HOURS = 6; // Retries em 6h (mais agressivo)
    private readonly MIN_SAFE_INTERVAL_MS = 3000; // Mínimo 3s entre jobs (rate limit)

    constructor(
        private readonly prisma: PrismaService,
        private readonly mtproto: MtprotoProvider,
        @InjectQueue(TRANSFER_QUEUE_NAME) private readonly transferQueue: Queue,
    ) {}

    // ── Inicia scraping de um grupo ──────────────────────────────────────

    async startScraping(
        botId: string,
        sourceGroupId: string,
        targetGroupId: string,
    ): Promise<{ jobId: string; message: string }> {
        const client = this.mtproto.getClient(botId);
        if (!client) {
            throw new Error(`MTProto client não encontrado para bot ${botId}`);
        }

        // Valida acesso aos grupos
        await this.validateGroupAccess(client, sourceGroupId, "source");
        await this.validateGroupAccess(client, targetGroupId, "target");

        // Cria job no banco
        const job = await this.prisma.groupScrapingJob.create({
            data: {
                botId,
                sourceGroupId,
                targetGroupId,
                status: "PENDING",
            },
        });

        // Enfileira o scraping (processo pesado, roda em background)
        await this.transferQueue.add(
            SCRAPE_GROUP_JOB,
            {
                botId,
                sourceGroupId,
                targetGroupId,
                jobId: job.id,
            } as ScrapeGroupJobData,
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000,
                },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 50 },
            },
        );

        this.logger.log(
            `[startScraping] Job ${job.id} criado para ${sourceGroupId} → ${targetGroupId}`,
        );

        return {
            jobId: job.id,
            message: `Scraping iniciado. Job ID: ${job.id}`,
        };
    }

    // ── Valida acesso ao grupo ───────────────────────────────────────────

    private async validateGroupAccess(
        client: TelegramClient,
        groupId: string,
        type: "source" | "target",
    ): Promise<void> {
        try {
            const entity = await client.getEntity(groupId);

            if (
                !(entity instanceof Api.Channel || entity instanceof Api.Chat)
            ) {
                throw new Error(`${groupId} não é um grupo válido`);
            }

            // Para grupo destino, verifica se tem permissão de adicionar membros
            if (type === "target" && entity instanceof Api.Channel) {
                const canInvite =
                    entity.creator || entity.adminRights?.inviteUsers;

                this.logger.debug(
                    "[PERMISSOES]",
                    entity.adminRights?.inviteUsers,
                );
                if (!canInvite) {
                    throw new Error(
                        `Sem permissão para adicionar membros em ${groupId}`,
                    );
                }
            }
        } catch (err: any) {
            this.logger.error(
                `[validateGroupAccess] Erro ao validar ${groupId}:`,
                err,
            );
            throw new Error(
                `Falha ao acessar grupo ${type} ${groupId}: ${err?.message}`,
            );
        }
    }

    // ── Executa scraping (chamado pelo processor) ────────────────────────

    async executeScraping(jobData: ScrapeGroupJobData): Promise<void> {
        const { botId, sourceGroupId, targetGroupId, jobId } = jobData;

        await this.prisma.groupScrapingJob.update({
            where: { id: jobId },
            data: { status: "IN_PROGRESS", startedAt: new Date() },
        });

        const client = this.mtproto.getClient(botId);
        if (!client) {
            throw new Error(`MTProto client não encontrado para bot ${botId}`);
        }

        try {
            // Obtém informações do grupo de origem
            const sourceEntity = await client.getEntity(sourceGroupId);
            const targetEntity = await client.getEntity(targetGroupId);

            // Validação de segurança: Scrapping só funciona em Chats ou Channels
            if (
                sourceEntity instanceof Api.User ||
                targetEntity instanceof Api.User ||
                sourceEntity instanceof Api.UserEmpty ||
                sourceEntity instanceof Api.ChatEmpty ||
                sourceEntity instanceof Api.ChatForbidden ||
                sourceEntity instanceof Api.ChannelForbidden
            ) {
                throw new Error(
                    "A origem ou o destino não podem ser usuários individuais, chats ou channels vazios.",
                );
            }

            const sourceTitle =
                sourceEntity instanceof Api.Channel
                    ? sourceEntity.title
                    : sourceEntity instanceof Api.Chat
                      ? sourceEntity.title
                      : sourceGroupId;

            const targetTitle =
                targetEntity instanceof Api.Channel
                    ? targetEntity.title
                    : targetEntity instanceof Api.Chat
                      ? targetEntity.title
                      : targetGroupId;

            await this.prisma.groupScrapingJob.update({
                where: { id: jobId },
                data: {
                    sourceGroupTitle: sourceTitle,
                    targetGroupTitle: targetTitle,
                },
            });

            // Extrai membros do grupo
            const members = await this.fetchGroupMembers(client, sourceEntity);

            this.logger.log(
                `[executeScraping] ${members.length} membros encontrados em ${sourceGroupId}`,
            );

            // Salva usuários no banco e enfileira transferências
            let scrapedCount = 0;
            const totalUsers = members.length;

            // ✅ Calcula intervalo baseado no DAILY_LIMIT configurado
            const intervalMs = this.calculateDistributionInterval(totalUsers);
            const { DAILY_LIMIT } = TRANSFER_DELAYS;

            this.logger.log(
                `[executeScraping] Enfileirando ${totalUsers} usuários ` +
                    `(DAILY_LIMIT: ${DAILY_LIMIT}, intervalo: ${(intervalMs / 1000).toFixed(1)}s)`,
            );

            for (const member of members) {
                try {
                    // Salva usuário no banco
                    const scrapedUser = await this.prisma.scrapedUser.create({
                        data: {
                            jobId,
                            userId: member.userId.toString(),
                            username: member.username || null,
                            firstName: member.firstName || null,
                            lastName: member.lastName || null,
                            phone: member.phone || null,
                            isBot: member.isBot,
                            isPremium: member.isPremium,
                        },
                    });

                    // Cria registro de transferência
                    await this.prisma.userTransfer.create({
                        data: {
                            jobId,
                            scrapedUserId: scrapedUser.id,
                            userId: member.userId.toString(),
                            status: "PENDING",
                        },
                    });

                    // ✅ Calcula delay progressivo com randomização
                    const { delayMs, scheduledAt } =
                        this.calculateProgressiveDelay(
                            scrapedCount,
                            intervalMs,
                        );

                    // ✅ Enfileira job de transferência
                    await this.enqueueTransferJob(
                        {
                            botId,
                            jobId,
                            scrapedUserId: scrapedUser.id,
                            userId: member.userId.toString(),
                            username: member.username,
                            targetGroupId,
                            attemptNumber: 1,
                            scheduledAt,
                        } as TransferUserJobData,
                        delayMs,
                    );

                    scrapedCount++;

                    // Log detalhado a cada 50 usuários (ou primeiro e último)
                    if (
                        scrapedCount === 1 ||
                        scrapedCount === totalUsers ||
                        scrapedCount % 50 === 0
                    ) {
                        const hoursUntilExecution = delayMs / (1000 * 60 * 60);
                        this.logger.log(
                            `[executeScraping] Job ${scrapedCount}/${totalUsers} enfileirado ` +
                                `(executa: ${scheduledAt.toLocaleString("pt-BR")}, ` +
                                `em ${hoursUntilExecution.toFixed(2)}h)`,
                        );
                    }
                } catch (err: any) {
                    this.logger.warn(
                        `[executeScraping] Erro ao processar usuário ${member.userId}: ${err?.message}`,
                    );
                }
            }

            await this.prisma.groupScrapingJob.update({
                where: { id: jobId },
                data: {
                    status: "COMPLETED",
                    totalUsers: members.length,
                    scrapedUsers: scrapedCount,
                    completedAt: new Date(),
                },
            });

            this.logger.log(
                `[executeScraping] Job ${jobId} concluído: ${scrapedCount}/${members.length} usuários enfileirados`,
            );
        } catch (err: any) {
            this.logger.error(`[executeScraping] Erro no job ${jobId}:`, err);

            await this.prisma.groupScrapingJob.update({
                where: { id: jobId },
                data: {
                    status: "FAILED",
                    error: err?.message || "Erro desconhecido",
                    completedAt: new Date(),
                },
            });

            throw err;
        }
    }

    // ── Extrai membros do grupo ──────────────────────────────────────────

    private async fetchGroupMembers(
        client: TelegramClient,
        entity: Api.Channel | Api.Chat,
    ): Promise<
        Array<{
            userId: bigInt.BigInteger;
            username?: string;
            firstName?: string;
            lastName?: string;
            phone?: string;
            isBot: boolean;
            isPremium: boolean;
        }>
    > {
        const members: Array<any> = [];

        try {
            if (entity instanceof Api.Channel) {
                // Canal/Supergrupo
                let offset = 0;
                const limit = 200;

                while (true) {
                    const result = (await client.invoke(
                        new Api.channels.GetParticipants({
                            channel: entity,
                            filter: new Api.ChannelParticipantsRecent(),
                            offset,
                            limit,
                        }),
                    )) as Api.channels.ChannelParticipants;

                    if (!result.users.length) break;

                    for (const user of result.users) {
                        if (user instanceof Api.User && !user.deleted) {
                            members.push({
                                userId: user.id,
                                username: user.username,
                                firstName: user.firstName,
                                lastName: user.lastName,
                                phone: user.phone,
                                isBot: user.bot || false,
                                isPremium: user.premium || false,
                            });
                        }
                    }

                    offset += result.users.length;

                    // Pausa para evitar flood
                    await new Promise((r) => setTimeout(r, 2000));

                    if (result.users.length < limit) break;
                }
            } else {
                // Grupo básico
                const full = (await client.invoke(
                    new Api.messages.GetFullChat({ chatId: entity.id }),
                )) as Api.messages.ChatFull;

                for (const user of full.users) {
                    if (user instanceof Api.User && !user.deleted) {
                        members.push({
                            userId: user.id,
                            username: user.username,
                            firstName: user.firstName,
                            lastName: user.lastName,
                            phone: user.phone,
                            isBot: user.bot || false,
                            isPremium: user.premium || false,
                        });
                    }
                }
            }
        } catch (err: any) {
            this.logger.error("[fetchGroupMembers] Erro:", err);
            throw err;
        }

        // Filtra bots (opcional)
        return members.filter((m) => !m.isBot);
    }

    // ── Calcula delay para transferência (anti-spam) ─────────────────────
    // ⚠️ MÉTODO OBSOLETO - Substituído por delay progressivo inline
    // Este método não garante intervalos progressivos entre jobs consecutivos.
    // Mantido comentado para referência histórica.

    /*
    private calculateTransferDelay(position: number): number {
        const { MIN_SECONDS, MAX_SECONDS, DAILY_LIMIT } = TRANSFER_DELAYS;

        // Distribui os convites ao longo de 24h
        const hoursInDay = 24;
        const msInHour = 60 * 60 * 1000;
        const baseDelay = (hoursInDay * msInHour) / DAILY_LIMIT;

        // Adiciona randomização entre MIN e MAX
        const randomFactor =
            Math.random() * (MAX_SECONDS - MIN_SECONDS) + MIN_SECONDS;
        const delayMs = Math.max(baseDelay, randomFactor * 1000);

        this.logger.debug(
            `[calculateTransferDelay] Posição ${position}: delay de ${(delayMs / 1000).toFixed(1)}s`,
        );

        return Math.floor(delayMs);
    }
    */

    // ── Calcula intervalo de distribuição baseado no DAILY_LIMIT ────────

    /**
     * Calcula o intervalo entre jobs baseado no limite diário configurado.
     *
     * @param totalUsers Total de usuários a serem transferidos
     * @returns Intervalo em ms entre cada job
     */
    private calculateDistributionInterval(totalUsers: number): number {
        const { DAILY_LIMIT } = TRANSFER_DELAYS;
        const distributionMs = this.DISTRIBUTION_HOURS * 60 * 60 * 1000;

        // Se o total está dentro do limite diário, distribui uniformemente
        if (totalUsers <= DAILY_LIMIT) {
            const baseInterval = Math.floor(distributionMs / totalUsers);
            return Math.max(baseInterval, this.MIN_SAFE_INTERVAL_MS);
        }

        // Se excede o limite diário, usa o intervalo mínimo seguro
        // Isso vai ultrapassar 24h, mas respeita o rate limit do Telegram
        this.logger.warn(
            `[calculateDistributionInterval] Total (${totalUsers}) excede DAILY_LIMIT (${DAILY_LIMIT}). ` +
                `Usando intervalo mínimo (${this.MIN_SAFE_INTERVAL_MS}ms). ` +
                `Tempo estimado: ${((totalUsers * this.MIN_SAFE_INTERVAL_MS) / (1000 * 60 * 60)).toFixed(1)}h`,
        );

        return this.MIN_SAFE_INTERVAL_MS;
    }

    /**
     * Calcula o delay progressivo para um job específico.
     *
     * @param position Posição do job na fila (0-indexed)
     * @param intervalMs Intervalo base entre jobs
     * @returns Delay final em ms com randomização aplicada
     */
    private calculateProgressiveDelay(
        position: number,
        intervalMs: number,
    ): { delayMs: number; scheduledAt: Date } {
        // Delay cumulativo: cada job espera mais que o anterior
        const progressiveDelayMs = position * intervalMs;

        // Randomização de ±5% para evitar detecção de padrão
        const randomRangeMs = Math.floor(intervalMs * 0.05);
        const randomOffsetMs =
            Math.floor(Math.random() * randomRangeMs * 2) - randomRangeMs;

        const finalDelayMs = Math.max(0, progressiveDelayMs + randomOffsetMs);
        const scheduledAt = new Date(Date.now() + finalDelayMs);

        return { delayMs: finalDelayMs, scheduledAt };
    }

    /**
     * Enfileira um job de transferência com todas as configurações necessárias.
     */
    private async enqueueTransferJob(
        data: TransferUserJobData,
        delayMs: number,
        attempts: number = 5,
    ): Promise<void> {
        await this.transferQueue.add(TRANSFER_USER_JOB, data, {
            delay: delayMs,
            attempts,
            backoff: {
                type: "exponential",
                delay: 10000,
            },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 500 },
        });
    }

    // ── Retenta transferências falhadas ──────────────────────────────────

    async retryFailed(jobId: string): Promise<{ retried: number }> {
        const failed = await this.prisma.userTransfer.findMany({
            where: {
                jobId,
                status: "FAILED",
                attempts: { lt: 5 },
            },
        });

        const job = await this.prisma.groupScrapingJob.findUnique({
            where: { id: jobId },
        });

        if (!job) {
            throw new Error(`Job ${jobId} não encontrado`);
        }

        let retried = 0;
        const totalRetries = failed.length;

        // ✅ Calcula intervalo para retries (distribuição em RETRY_DISTRIBUTION_HOURS)
        const { DAILY_LIMIT } = TRANSFER_DELAYS;
        const distributionMs = this.RETRY_DISTRIBUTION_HOURS * 60 * 60 * 1000;
        const baseInterval = Math.floor(
            distributionMs / Math.min(totalRetries, DAILY_LIMIT),
        );
        const intervalMs = Math.max(baseInterval, this.MIN_SAFE_INTERVAL_MS);

        this.logger.log(
            `[retryFailed] Reenfileirando ${totalRetries} transferências falhadas ` +
                `(intervalo: ${(intervalMs / 1000).toFixed(1)}s)`,
        );

        for (const transfer of failed) {
            await this.prisma.userTransfer.update({
                where: { id: transfer.id },
                data: { status: "PENDING" },
            });

            // ✅ Calcula delay progressivo
            const { delayMs, scheduledAt } = this.calculateProgressiveDelay(
                retried,
                intervalMs,
            );

            // ✅ Enfileira retry
            await this.enqueueTransferJob(
                {
                    botId: job.botId,
                    jobId,
                    scrapedUserId: transfer.scrapedUserId,
                    userId: transfer.userId,
                    targetGroupId: job.targetGroupId,
                    attemptNumber: transfer.attempts + 1,
                    scheduledAt,
                } as TransferUserJobData,
                delayMs,
                5 - transfer.attempts, // ✅ Attempts restantes (ex: se já tentou 2x, restam 3)
            );

            retried++;

            if (
                retried === 1 ||
                retried === totalRetries ||
                retried % 20 === 0
            ) {
                this.logger.debug(
                    `[retryFailed] Retry ${retried}/${totalRetries} enfileirado ` +
                        `(executa: ${scheduledAt.toLocaleString("pt-BR")})`,
                );
            }
        }

        this.logger.log(
            `[retryFailed] ${retried} transferências reenfileiradas para job ${jobId}`,
        );

        return { retried };
    }

    // ── Consulta progresso ───────────────────────────────────────────────

    async getProgress(jobId: string): Promise<ScrapingProgress> {
        const job = await this.prisma.groupScrapingJob.findUnique({
            where: { id: jobId },
            include: {
                transfers: {
                    select: { status: true },
                },
            },
        });

        if (!job) {
            throw new Error(`Job ${jobId} não encontrado`);
        }

        const stats = this.calculateTransferStats(job.transfers);

        return {
            jobId: job.id,
            status: job.status,
            totalUsers: job.totalUsers,
            scrapedUsers: job.scrapedUsers,
            transferredUsers: stats.transferred,
            failedUsers: stats.failed,
            pendingUsers: stats.pending,
            errors: job.error ? [job.error] : [],
        };
    }

    // ── Lista jobs ────────────────────────────────────────────────────────

    async listJobs(botId?: string): Promise<ScrapingProgress[]> {
        const jobs = await this.prisma.groupScrapingJob.findMany({
            where: botId ? { botId } : undefined,
            include: {
                transfers: {
                    select: { status: true },
                },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        return jobs.map((job) => {
            const stats = this.calculateTransferStats(job.transfers);
            return {
                jobId: job.id,
                status: job.status,
                totalUsers: job.totalUsers,
                scrapedUsers: job.scrapedUsers,
                transferredUsers: stats.transferred,
                failedUsers: stats.failed,
                pendingUsers: stats.pending,
                errors: job.error ? [job.error] : [],
            };
        });
    }

    // ── Estatísticas de transferência ────────────────────────────────────

    private calculateTransferStats(
        transfers: Array<{ status: string }>,
    ): TransferStats {
        const stats: TransferStats = {
            total: transfers.length,
            pending: 0,
            transferred: 0,
            failed: 0,
            floodWait: 0,
            userPrivacy: 0,
            alreadyParticipant: 0,
        };

        for (const t of transfers) {
            switch (t.status) {
                case "PENDING":
                    stats.pending++;
                    break;
                case "TRANSFERRED":
                    stats.transferred++;
                    break;
                case "FAILED":
                    stats.failed++;
                    break;
                case "FLOOD_WAIT":
                    stats.floodWait++;
                    break;
                case "USER_PRIVACY":
                    stats.userPrivacy++;
                    break;
                case "ALREADY_PARTICIPANT":
                    stats.alreadyParticipant++;
                    break;
            }
        }

        return stats;
    }
}
