import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AdminAiUsageTotals = {
    requestCount: number;
    conversationCount: number;
    clientCount: number;
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    averageTotalTokensPerRequest: number;
};

export type AdminAiUsageClientRow = {
    ownerUserId: string;
    ownerName: string | null;
    ownerEmail: string | null;
    requestCount: number;
    conversationCount: number;
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    averageTotalTokensPerRequest: number;
    lastUsageAt: Date | null;
};

export type AdminAiUsageConversationRow = {
    conversationKey: string;
    ownerUserId: string;
    ownerName: string | null;
    ownerEmail: string | null;
    channel: "TELEGRAM" | "WHATSAPP" | "UNKNOWN";
    botName: string | null;
    whatsappInstanceName: string | null;
    contactLabel: string | null;
    contactId: string | null;
    modelsUsed: string[];
    requestCount: number;
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    averageTotalTokensPerRequest: number;
    lastUsageAt: Date | null;
};

export type AdminAiUsageDashboard = {
    totals: AdminAiUsageTotals;
    clients: AdminAiUsageClientRow[];
    conversations: AdminAiUsageConversationRow[];
};

type RawSummaryRow = {
    requestCount: bigint | number | null;
    conversationCount: bigint | number | null;
    clientCount: bigint | number | null;
    promptTokenCount: bigint | number | null;
    candidatesTokenCount: bigint | number | null;
    totalTokenCount: bigint | number | null;
};

type RawClientRow = {
    ownerUserId: string;
    ownerName: string | null;
    ownerEmail: string | null;
    requestCount: bigint | number | null;
    conversationCount: bigint | number | null;
    promptTokenCount: bigint | number | null;
    candidatesTokenCount: bigint | number | null;
    totalTokenCount: bigint | number | null;
    lastUsageAt: Date | string | null;
};

type RawConversationRow = {
    conversationKey: string;
    ownerUserId: string;
    ownerName: string | null;
    ownerEmail: string | null;
    channel: "TELEGRAM" | "WHATSAPP" | "UNKNOWN";
    botName: string | null;
    whatsappInstanceName: string | null;
    contactLabel: string | null;
    contactId: string | null;
    modelsUsed: string | null;
    requestCount: bigint | number | null;
    promptTokenCount: bigint | number | null;
    candidatesTokenCount: bigint | number | null;
    totalTokenCount: bigint | number | null;
    lastUsageAt: Date | string | null;
};

const AI_USAGE_CTE = Prisma.sql`
    WITH scoped_ai_usage AS (
        SELECT
            cm.id,
            cm."telegramId" AS conversation_key,
            cm."createdAt" AS created_at,
            COALESCE(cm."promptTokenCount", 0) AS prompt_tokens,
            COALESCE(cm."candidatesTokenCount", 0) AS candidate_tokens,
            COALESCE(
                cm."totalTokenCount",
                COALESCE(cm."promptTokenCount", 0) + COALESCE(cm."candidatesTokenCount", 0)
            ) AS total_tokens,
            cm."aiModel" AS ai_model,
            CASE
                WHEN cm."botId" IS NOT NULL THEN 'TELEGRAM'
                WHEN cm."telegramId" LIKE 'whatsapp:%:%' THEN 'WHATSAPP'
                ELSE 'UNKNOWN'
            END AS channel,
            ba.name AS bot_name,
            tu."firstName" AS telegram_first_name,
            tu.username AS telegram_username,
            wi."instanceName" AS whatsapp_instance_name,
            wc."displayName" AS whatsapp_customer_name,
            CASE
                WHEN cm."botId" IS NOT NULL THEN ba."ownerUserId"
                WHEN cm."telegramId" LIKE 'whatsapp:%:%' THEN wi."userId"
                ELSE NULL
            END AS owner_user_id,
            CASE
                WHEN cm."botId" IS NOT NULL THEN cm."telegramId"
                WHEN cm."telegramId" LIKE 'whatsapp:%:%' THEN split_part(cm."telegramId", ':', 3)
                ELSE cm."telegramId"
            END AS contact_id
        FROM "ChatMessage" cm
        LEFT JOIN "BotAccount" ba
            ON ba.id = cm."botId"
        LEFT JOIN "TelegramUser" tu
            ON tu."botId" = cm."botId"
            AND tu."chatId" = cm."telegramId"
        LEFT JOIN "WhatsappInstance" wi
            ON cm."botId" IS NULL
            AND cm."telegramId" LIKE 'whatsapp:%:%'
            AND wi.id = split_part(cm."telegramId", ':', 2)
        LEFT JOIN "WhatsappCustomer" wc
            ON wc."ownerUserId" = wi."userId"
            AND wc."whatsappId" = split_part(cm."telegramId", ':', 3)
        WHERE
            cm."promptTokenCount" IS NOT NULL
            OR cm."candidatesTokenCount" IS NOT NULL
            OR cm."totalTokenCount" IS NOT NULL
    )
`;

export async function getAdminAiUsageDashboard(): Promise<AdminAiUsageDashboard> {
    const [summaryRows, clientRows, conversationRows] = await Promise.all([
        prisma.$queryRaw<RawSummaryRow[]>(Prisma.sql`
            ${AI_USAGE_CTE}
            SELECT
                COUNT(*) AS "requestCount",
                COUNT(DISTINCT sau.conversation_key) AS "conversationCount",
                COUNT(DISTINCT sau.owner_user_id) AS "clientCount",
                COALESCE(SUM(sau.prompt_tokens), 0) AS "promptTokenCount",
                COALESCE(SUM(sau.candidate_tokens), 0) AS "candidatesTokenCount",
                COALESCE(SUM(sau.total_tokens), 0) AS "totalTokenCount"
            FROM scoped_ai_usage sau
            WHERE sau.owner_user_id IS NOT NULL
        `),
        prisma.$queryRaw<RawClientRow[]>(Prisma.sql`
            ${AI_USAGE_CTE}
            SELECT
                sau.owner_user_id AS "ownerUserId",
                u.name AS "ownerName",
                u.email AS "ownerEmail",
                COUNT(*) AS "requestCount",
                COUNT(DISTINCT sau.conversation_key) AS "conversationCount",
                COALESCE(SUM(sau.prompt_tokens), 0) AS "promptTokenCount",
                COALESCE(SUM(sau.candidate_tokens), 0) AS "candidatesTokenCount",
                COALESCE(SUM(sau.total_tokens), 0) AS "totalTokenCount",
                MAX(sau.created_at) AS "lastUsageAt"
            FROM scoped_ai_usage sau
            INNER JOIN "User" u
                ON u.id = sau.owner_user_id
            WHERE sau.owner_user_id IS NOT NULL
            GROUP BY sau.owner_user_id, u.name, u.email
            ORDER BY "totalTokenCount" DESC, "requestCount" DESC, "lastUsageAt" DESC
            LIMIT 25
        `),
        prisma.$queryRaw<RawConversationRow[]>(Prisma.sql`
            ${AI_USAGE_CTE}
            SELECT
                sau.conversation_key AS "conversationKey",
                sau.owner_user_id AS "ownerUserId",
                u.name AS "ownerName",
                u.email AS "ownerEmail",
                sau.channel AS "channel",
                MAX(sau.bot_name) AS "botName",
                MAX(sau.whatsapp_instance_name) AS "whatsappInstanceName",
                MAX(
                    CASE
                        WHEN sau.channel = 'TELEGRAM' THEN COALESCE(
                            NULLIF(sau.telegram_first_name, ''),
                            CASE
                                WHEN sau.telegram_username IS NOT NULL
                                    AND sau.telegram_username <> ''
                                THEN CONCAT('@', sau.telegram_username)
                                ELSE NULL
                            END,
                            sau.contact_id
                        )
                        WHEN sau.channel = 'WHATSAPP' THEN COALESCE(
                            NULLIF(sau.whatsapp_customer_name, ''),
                            sau.contact_id
                        )
                        ELSE sau.contact_id
                    END
                ) AS "contactLabel",
                MAX(sau.contact_id) AS "contactId",
                STRING_AGG(
                    DISTINCT COALESCE(sau.ai_model, 'desconhecido'),
                    ', '
                    ORDER BY COALESCE(sau.ai_model, 'desconhecido')
                ) AS "modelsUsed",
                COUNT(*) AS "requestCount",
                COALESCE(SUM(sau.prompt_tokens), 0) AS "promptTokenCount",
                COALESCE(SUM(sau.candidate_tokens), 0) AS "candidatesTokenCount",
                COALESCE(SUM(sau.total_tokens), 0) AS "totalTokenCount",
                MAX(sau.created_at) AS "lastUsageAt"
            FROM scoped_ai_usage sau
            INNER JOIN "User" u
                ON u.id = sau.owner_user_id
            WHERE sau.owner_user_id IS NOT NULL
            GROUP BY
                sau.conversation_key,
                sau.owner_user_id,
                u.name,
                u.email,
                sau.channel
            ORDER BY "totalTokenCount" DESC, "lastUsageAt" DESC
            LIMIT 40
        `),
    ]);

    const summary = summaryRows[0];
    const totals: AdminAiUsageTotals = {
        requestCount: toNumber(summary?.requestCount),
        conversationCount: toNumber(summary?.conversationCount),
        clientCount: toNumber(summary?.clientCount),
        promptTokenCount: toNumber(summary?.promptTokenCount),
        candidatesTokenCount: toNumber(summary?.candidatesTokenCount),
        totalTokenCount: toNumber(summary?.totalTokenCount),
        averageTotalTokensPerRequest: calculateAverage(
            toNumber(summary?.totalTokenCount),
            toNumber(summary?.requestCount),
        ),
    };

    return {
        totals,
        clients: clientRows.map((row) => {
            const totalTokenCount = toNumber(row.totalTokenCount);
            const requestCount = toNumber(row.requestCount);

            return {
                ownerUserId: row.ownerUserId,
                ownerName: row.ownerName,
                ownerEmail: row.ownerEmail,
                requestCount,
                conversationCount: toNumber(row.conversationCount),
                promptTokenCount: toNumber(row.promptTokenCount),
                candidatesTokenCount: toNumber(row.candidatesTokenCount),
                totalTokenCount,
                averageTotalTokensPerRequest: calculateAverage(
                    totalTokenCount,
                    requestCount,
                ),
                lastUsageAt: toDate(row.lastUsageAt),
            };
        }),
        conversations: conversationRows.map((row) => {
            const totalTokenCount = toNumber(row.totalTokenCount);
            const requestCount = toNumber(row.requestCount);

            return {
                conversationKey: row.conversationKey,
                ownerUserId: row.ownerUserId,
                ownerName: row.ownerName,
                ownerEmail: row.ownerEmail,
                channel: row.channel,
                botName: row.botName,
                whatsappInstanceName: row.whatsappInstanceName,
                contactLabel: row.contactLabel,
                contactId: row.contactId,
                modelsUsed: splitModels(row.modelsUsed),
                requestCount,
                promptTokenCount: toNumber(row.promptTokenCount),
                candidatesTokenCount: toNumber(row.candidatesTokenCount),
                totalTokenCount,
                averageTotalTokensPerRequest: calculateAverage(
                    totalTokenCount,
                    requestCount,
                ),
                lastUsageAt: toDate(row.lastUsageAt),
            };
        }),
    };
}

function toNumber(value: unknown): number {
    if (typeof value === "bigint") {
        return Number(value);
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function calculateAverage(total: number, count: number): number {
    if (!count) {
        return 0;
    }

    return Math.round(total / count);
}

function splitModels(value: string | null): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean);
}

function toDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}
