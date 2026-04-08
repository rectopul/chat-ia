import { Injectable } from "@nestjs/common";
import {
    PlanType,
    Prisma,
    SubscriptionStatus,
    TransactionStatus,
} from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";

type BalancePeriod = "daily" | "monthly";

type ProcessedMessagesRow = {
    day: Date;
    totalMessagesProcessed: bigint | number;
    telegramMessagesProcessed: bigint | number;
    whatsappMessagesProcessed: bigint | number;
};

type ProcessedMessagesSummaryRow = {
    totalProcessedMessages: bigint | number;
    telegramProcessedMessages: bigint | number;
    whatsappProcessedMessages: bigint | number;
    whatsappGeneratedAudios: bigint | number;
};

@Injectable()
export class AdminMonitoringService {
    private static readonly CONNECTED_STATUSES = new Set([
        "CONNECTED",
        "ACTIVE",
        "OPEN",
        "READY",
    ]);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {}

    async getProcessedMessagesByDay(filters: {
        planType?: PlanType;
        from?: Date;
        to?: Date;
    }) {
        const range = this.resolveRange(filters.from, filters.to, "monthly");
        const planFilterSql = filters.planType
            ? Prisma.sql`AND rm."planType" = ${filters.planType}::"PlanType"`
            : Prisma.empty;

        const rows = await this.prisma.$queryRaw<ProcessedMessagesRow[]>(
            Prisma.sql`
                WITH resolved_messages AS (
                    SELECT
                        cm."createdAt",
                        cm."role",
                        cm."messageType",
                        CASE
                            WHEN cm."botId" IS NOT NULL AND b."ownerUserId" IS NULL THEN 'ENTERPRISE'::"PlanType"
                            WHEN cm."botId" IS NOT NULL THEN COALESCE(ts."planType", 'FREE'::"PlanType")
                            WHEN cm."telegramId" LIKE 'whatsapp:%' THEN COALESCE(ws."planType", 'FREE'::"PlanType")
                            ELSE 'FREE'::"PlanType"
                        END AS "planType",
                        CASE
                            WHEN cm."telegramId" LIKE 'whatsapp:%' THEN 'WHATSAPP'
                            ELSE 'TELEGRAM'
                        END AS "channel"
                    FROM "ChatMessage" cm
                    LEFT JOIN "BotAccount" b
                        ON b."id" = cm."botId"
                    LEFT JOIN "Subscription" ts
                        ON ts."userId" = b."ownerUserId"
                    LEFT JOIN "WhatsappInstance" wi
                        ON cm."botId" IS NULL
                        AND cm."telegramId" LIKE 'whatsapp:%'
                        AND wi."id" = split_part(cm."telegramId", ':', 2)
                    LEFT JOIN "Subscription" ws
                        ON ws."userId" = wi."userId"
                    WHERE cm."createdAt" >= ${range.from}
                      AND cm."createdAt" < ${range.to}
                )
                SELECT
                    date_trunc('day', rm."createdAt") AS "day",
                    COUNT(*) FILTER (
                        WHERE rm."role" = 'user'
                    )::bigint AS "totalMessagesProcessed",
                    COUNT(*) FILTER (
                        WHERE rm."role" = 'user' AND rm."channel" = 'TELEGRAM'
                    )::bigint AS "telegramMessagesProcessed",
                    COUNT(*) FILTER (
                        WHERE rm."role" = 'user' AND rm."channel" = 'WHATSAPP'
                    )::bigint AS "whatsappMessagesProcessed"
                FROM resolved_messages rm
                WHERE 1 = 1
                ${planFilterSql}
                GROUP BY 1
                ORDER BY 1 ASC
            `,
        );

        return {
            planType: filters.planType ?? null,
            from: range.from,
            to: range.to,
            rows: rows.map((row) => ({
                day: row.day,
                totalMessagesProcessed: this.toNumber(
                    row.totalMessagesProcessed,
                ),
                telegramMessagesProcessed: this.toNumber(
                    row.telegramMessagesProcessed,
                ),
                whatsappMessagesProcessed: this.toNumber(
                    row.whatsappMessagesProcessed,
                ),
            })),
        };
    }

    async getInstanceHealth() {
        const instances = await this.prisma.whatsappInstance.findMany({
            select: { status: true },
        });

        const byStatus: Record<string, number> = {};
        let connected = 0;
        let disconnected = 0;

        for (const instance of instances) {
            const normalizedStatus = (instance.status || "UNKNOWN").trim().toUpperCase();
            byStatus[normalizedStatus] = (byStatus[normalizedStatus] ?? 0) + 1;

            if (
                AdminMonitoringService.CONNECTED_STATUSES.has(normalizedStatus)
            ) {
                connected += 1;
            } else {
                disconnected += 1;
            }
        }

        const total = instances.length;

        return {
            total,
            connected,
            disconnected,
            connectedRate: total
                ? Number(((connected / total) * 100).toFixed(2))
                : 0,
            byStatus,
        };
    }

    async getFinancialOverview(input: {
        period: BalancePeriod;
        planType?: PlanType;
        from?: Date;
        to?: Date;
    }) {
        const range = this.resolveRange(input.from, input.to, input.period);
        const processedSummary = await this.getProcessedMessagesSummary({
            planType: input.planType,
            from: range.from,
            to: range.to,
        });

        const subscriptionRevenue = await this.prisma.transaction.aggregate({
            where: {
                status: TransactionStatus.PAID,
                referenceDate: {
                    gte: range.from,
                    lt: range.to,
                },
                ...(input.planType
                    ? {
                          subscription: {
                              is: {
                                  planType: input.planType,
                              },
                          },
                      }
                    : {}),
            },
            _sum: { amountCents: true },
        });

        const activeSubscriptions = await this.prisma.subscription.aggregate({
            where: {
                status: SubscriptionStatus.ACTIVE,
                ...(input.planType ? { planType: input.planType } : {}),
            },
            _sum: { planPriceCents: true },
        });

        const unitCostsCents = {
            telegramMessage: this.getEnvCost(
                "ESTIMATED_TELEGRAM_API_COST_PER_MESSAGE_CENTS",
            ),
            whatsappMessage: this.getEnvCost(
                "ESTIMATED_WHATSAPP_API_COST_PER_MESSAGE_CENTS",
            ),
            whatsappTtsAudio: this.getEnvCost(
                "ESTIMATED_WHATSAPP_TTS_COST_PER_AUDIO_CENTS",
            ),
        };

        const estimatedApiCostCents =
            processedSummary.telegramProcessedMessages *
                unitCostsCents.telegramMessage +
            processedSummary.whatsappProcessedMessages *
                unitCostsCents.whatsappMessage +
            processedSummary.whatsappGeneratedAudios *
                unitCostsCents.whatsappTtsAudio;

        const subscriptionRevenueCents =
            subscriptionRevenue._sum.amountCents ?? 0;
        const activeSubscriptionMrrCents =
            activeSubscriptions._sum.planPriceCents ?? 0;

        return {
            period: input.period,
            planType: input.planType ?? null,
            from: range.from,
            to: range.to,
            subscriptionRevenueCents,
            activeSubscriptionMrrCents,
            estimatedApiCostCents,
            netRevenueCents:
                subscriptionRevenueCents - estimatedApiCostCents,
            costToRevenueRatio:
                subscriptionRevenueCents > 0
                    ? Number(
                          (
                              estimatedApiCostCents /
                              subscriptionRevenueCents
                          ).toFixed(4),
                      )
                    : null,
            processedMessages: processedSummary,
            unitCostsCents,
            instanceHealth: await this.getInstanceHealth(),
        };
    }

    getOpenApiDocument() {
        return {
            openapi: "3.0.3",
            info: {
                title: "Telegram User Service Admin API",
                version: "1.0.0",
                description:
                    "Documentacao basica dos endpoints de monitoramento e balanceamento financeiro do AdminModule.",
            },
            paths: {
                "/admin/monitoring/messages": {
                    get: {
                        summary: "Total de mensagens processadas por dia",
                        tags: ["Admin Monitoring"],
                        parameters: [
                            this.buildQueryParam(
                                "planType",
                                "PlanType",
                                false,
                                "Filtra o relatorio por plano.",
                            ),
                            this.buildQueryParam(
                                "from",
                                "string",
                                false,
                                "Data inicial em ISO-8601.",
                                "date-time",
                            ),
                            this.buildQueryParam(
                                "to",
                                "string",
                                false,
                                "Data final em ISO-8601.",
                                "date-time",
                            ),
                        ],
                        responses: {
                            "200": {
                                description:
                                    "Serie diaria de mensagens processadas.",
                            },
                        },
                    },
                },
                "/admin/monitoring/instances/health": {
                    get: {
                        summary: "Saude das instancias de WhatsApp",
                        tags: ["Admin Monitoring"],
                        responses: {
                            "200": {
                                description:
                                    "Quantidade de instancias conectadas, desconectadas e distribuicao por status.",
                            },
                        },
                    },
                },
                "/admin/monitoring/financial": {
                    get: {
                        summary:
                            "Visao financeira com custo estimado de API vs receita",
                        tags: ["Admin Monitoring"],
                        parameters: [
                            this.buildQueryParam(
                                "period",
                                "string",
                                false,
                                "Periodo de agregacao.",
                            ),
                            this.buildQueryParam(
                                "planType",
                                "PlanType",
                                false,
                                "Filtra o relatorio por plano.",
                            ),
                            this.buildQueryParam(
                                "from",
                                "string",
                                false,
                                "Data inicial em ISO-8601.",
                                "date-time",
                            ),
                            this.buildQueryParam(
                                "to",
                                "string",
                                false,
                                "Data final em ISO-8601.",
                                "date-time",
                            ),
                        ],
                        responses: {
                            "200": {
                                description:
                                    "Resumo financeiro com receita, custo estimado de API e saude das instancias.",
                            },
                        },
                    },
                },
                "/admin/balance": {
                    get: {
                        summary:
                            "Balance com receita de assinaturas e custo estimado de API",
                        tags: ["Admin Monitoring"],
                        parameters: [
                            this.buildQueryParam(
                                "period",
                                "string",
                                false,
                                "Periodo de agregacao.",
                            ),
                            this.buildQueryParam(
                                "planType",
                                "PlanType",
                                false,
                                "Filtra o relatorio por plano.",
                            ),
                            this.buildQueryParam(
                                "from",
                                "string",
                                false,
                                "Data inicial em ISO-8601.",
                                "date-time",
                            ),
                            this.buildQueryParam(
                                "to",
                                "string",
                                false,
                                "Data final em ISO-8601.",
                                "date-time",
                            ),
                        ],
                        responses: {
                            "200": {
                                description:
                                    "Balance enriquecido com custo estimado de API e receita.",
                            },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    PlanType: {
                        type: "string",
                        enum: Object.values(PlanType),
                    },
                },
            },
        };
    }

    getSwaggerHtml(specPath: string): string {
        return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Admin API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '${specPath}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`;
    }

    private async getProcessedMessagesSummary(filters: {
        planType?: PlanType;
        from: Date;
        to: Date;
    }) {
        const planFilterSql = filters.planType
            ? Prisma.sql`AND rm."planType" = ${filters.planType}::"PlanType"`
            : Prisma.empty;

        const [row] = await this.prisma.$queryRaw<
            ProcessedMessagesSummaryRow[]
        >(Prisma.sql`
            WITH resolved_messages AS (
                SELECT
                    cm."createdAt",
                    cm."role",
                    cm."messageType",
                    CASE
                        WHEN cm."botId" IS NOT NULL AND b."ownerUserId" IS NULL THEN 'ENTERPRISE'::"PlanType"
                        WHEN cm."botId" IS NOT NULL THEN COALESCE(ts."planType", 'FREE'::"PlanType")
                        WHEN cm."telegramId" LIKE 'whatsapp:%' THEN COALESCE(ws."planType", 'FREE'::"PlanType")
                        ELSE 'FREE'::"PlanType"
                    END AS "planType",
                    CASE
                        WHEN cm."telegramId" LIKE 'whatsapp:%' THEN 'WHATSAPP'
                        ELSE 'TELEGRAM'
                    END AS "channel"
                FROM "ChatMessage" cm
                LEFT JOIN "BotAccount" b
                    ON b."id" = cm."botId"
                LEFT JOIN "Subscription" ts
                    ON ts."userId" = b."ownerUserId"
                LEFT JOIN "WhatsappInstance" wi
                    ON cm."botId" IS NULL
                    AND cm."telegramId" LIKE 'whatsapp:%'
                    AND wi."id" = split_part(cm."telegramId", ':', 2)
                LEFT JOIN "Subscription" ws
                    ON ws."userId" = wi."userId"
                WHERE cm."createdAt" >= ${filters.from}
                  AND cm."createdAt" < ${filters.to}
            )
            SELECT
                COUNT(*) FILTER (
                    WHERE rm."role" = 'user'
                )::bigint AS "totalProcessedMessages",
                COUNT(*) FILTER (
                    WHERE rm."role" = 'user' AND rm."channel" = 'TELEGRAM'
                )::bigint AS "telegramProcessedMessages",
                COUNT(*) FILTER (
                    WHERE rm."role" = 'user' AND rm."channel" = 'WHATSAPP'
                )::bigint AS "whatsappProcessedMessages",
                COUNT(*) FILTER (
                    WHERE rm."role" = 'model'
                      AND rm."channel" = 'WHATSAPP'
                      AND rm."messageType" = 'AUDIO'
                )::bigint AS "whatsappGeneratedAudios"
            FROM resolved_messages rm
            WHERE 1 = 1
            ${planFilterSql}
        `);

        return {
            totalProcessedMessages: this.toNumber(
                row?.totalProcessedMessages ?? 0,
            ),
            telegramProcessedMessages: this.toNumber(
                row?.telegramProcessedMessages ?? 0,
            ),
            whatsappProcessedMessages: this.toNumber(
                row?.whatsappProcessedMessages ?? 0,
            ),
            whatsappGeneratedAudios: this.toNumber(
                row?.whatsappGeneratedAudios ?? 0,
            ),
        };
    }

    private resolveRange(
        from: Date | undefined,
        to: Date | undefined,
        period: BalancePeriod,
    ) {
        const now = new Date();
        const defaultFrom =
            period === "daily"
                ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
                : new Date(now.getFullYear(), now.getMonth(), 1);
        const start = from ?? defaultFrom;
        const end =
            to ??
            new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() + 1,
            );

        return {
            from: start,
            to: end,
        };
    }

    private getEnvCost(key: string): number {
        const value = this.configService.get<string>(key);
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private toNumber(value: bigint | number): number {
        return typeof value === "bigint" ? Number(value) : value;
    }

    private buildQueryParam(
        name: string,
        type: string,
        required: boolean,
        description: string,
        format?: string,
    ) {
        return {
            name,
            in: "query",
            required,
            description,
            schema: {
                ...(type === "PlanType"
                    ? { $ref: "#/components/schemas/PlanType" }
                    : { type }),
                ...(format ? { format } : {}),
            },
        };
    }
}
