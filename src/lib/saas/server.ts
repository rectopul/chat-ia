import { prisma } from "@/lib/prisma";
import { fetchNestApiJson } from "@/lib/nest-api";
import { hasActiveSubscriptionAccess } from "./access";
import { getPlanDefinition, getPlanCatalog } from "./plans";
import {
    ChatMessageRole,
    PlanType,
    Prisma,
    Subscription,
    SubscriptionStatus,
    Transaction,
    TransactionStatus,
    UserAccessStatus,
    UserRole,
} from "@prisma/client";

type BillingCheckoutResponse = {
    subscription: Subscription;
    transaction: Transaction;
    pixCode: string;
    gatewayReference: string;
};

type UnknownRecord = Record<string, unknown>;

export async function getUserWithSaasContext(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
        include: {
            subscription: true,
            bots: {
                orderBy: { createdAt: "desc" },
            },
            transactions: {
                orderBy: { createdAt: "desc" },
                take: 10,
            },
            whatsappInstances: {
                orderBy: { createdAt: "desc" },
            },
            _count: {
                select: {
                    bots: true,
                    products: true,
                    templates: true,
                    orders: true,
                    whatsappInstances: true,
                    whatsappCustomers: true,
                },
            },
        },
    });
}

export async function getUserAiUsageToday(userId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const whatsappInstances = await prisma.whatsappInstance.findMany({
        where: { userId },
        select: { id: true },
    });

    const ownershipFilters: Prisma.ChatMessageWhereInput[] = [
        {
            bot: {
                ownerUserId: userId,
            },
        },
    ];

    for (const instance of whatsappInstances) {
        ownershipFilters.push({
            botId: null,
            telegramId: {
                startsWith: `whatsapp:${instance.id}:`,
            },
        });
    }

    return prisma.chatMessage.count({
        where: {
            role: ChatMessageRole.user,
            createdAt: { gte: start },
            OR: ownershipFilters,
        },
    });
}

export async function activateFreePlan(userId: string) {
    return fetchNestApiJson<Subscription>("/billing/activate-free", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
        },
    });
}

export async function createPaidPlanCheckout(
    userId: string,
    planType: PlanType,
) {
    if (planType === PlanType.FREE) {
        throw new Error("FREE plan must be activated directly");
    }

    return fetchNestApiJson<BillingCheckoutResponse>("/billing/checkout", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-user-id": userId,
        },
        body: JSON.stringify({ planType }),
    });
}

export async function handleSaasWebhook(payload: unknown) {
    const rawPayload = asRecord(payload);
    const data = asRecord(rawPayload.data ?? rawPayload);
    const normalizedStatus = normalizeStatus(data?.status);
    const eventType = normalizeEventType(rawPayload, data);
    const referenceCandidates = getReferenceCandidates(data);
    const gatewaySubscriptionId = getGatewaySubscriptionId(data);
    const transaction = await findTransaction(referenceCandidates);
    const parsedReference = parseExternalReference(referenceCandidates);
    const subscription = await resolveSubscription({
        transaction,
        parsedReference,
        gatewaySubscriptionId,
    });

    if (isSuccessEvent(normalizedStatus, eventType)) {
        await markSuccess({
            transaction,
            subscription,
            rawPayload,
            gatewaySubscriptionId,
            parsedReference,
            data,
        });
        return;
    }

    if (isFailureEvent(normalizedStatus, eventType)) {
        await markFailure({
            transaction,
            subscription,
            rawPayload,
            gatewaySubscriptionId,
        });
        return;
    }

    if (isCancelEvent(normalizedStatus, eventType)) {
        await markCanceled({
            subscription,
            gatewaySubscriptionId,
        });
    }
}

export async function getAdminSaasMetrics() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = addDays(now, -30);

    const [users, transactions, legacySales] = await Promise.all([
        prisma.user.findMany({
            where: { role: UserRole.CUSTOMER },
            include: { subscription: true },
        }),
        prisma.transaction.findMany({
            where: { status: TransactionStatus.PAID },
            select: { amountCents: true, referenceDate: true },
        }),
        prisma.sale.aggregate({
            where: { status: "PAID" },
            _sum: { amountCents: true },
        }),
    ]);

    const activeUsers = users.filter((user) =>
        hasActiveSubscriptionAccess({
            role: user.role,
            accessStatus: user.accessStatus,
            subscription: user.subscription,
        }),
    );

    const activePaid = activeUsers.filter(
        (user) =>
            user.subscription &&
            user.subscription.planPriceCents > 0 &&
            user.subscription.status === SubscriptionStatus.ACTIVE,
    );
    const canceledInWindow = users.filter(
        (user) =>
            user.subscription?.status === SubscriptionStatus.CANCELED &&
            user.subscription.updatedAt >= thirtyDaysAgo,
    ).length;

    const mrrCents = activePaid.reduce(
        (sum, user) => sum + (user.subscription?.planPriceCents ?? 0),
        0,
    );
    const totalRevenueCents = transactions.reduce(
        (sum, transaction) => sum + transaction.amountCents,
        0,
    );
    const paidInMonthCents = transactions
        .filter((transaction) => transaction.referenceDate >= monthStart)
        .reduce((sum, transaction) => sum + transaction.amountCents, 0);
    const churnBase = activePaid.length + canceledInWindow;

    return {
        mrrCents,
        churnRate:
            churnBase > 0
                ? Number(((canceledInWindow / churnBase) * 100).toFixed(2))
                : 0,
        activeUsers: activeUsers.length,
        totalRevenueCents,
        paidInMonthCents,
        legacySalesRevenueCents: legacySales._sum.amountCents ?? 0,
        plans: getPlanCatalog(),
    };
}

export async function getBalanceSnapshot(period: "daily" | "monthly") {
    const now = new Date();
    const start =
        period === "daily"
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
            : new Date(now.getFullYear(), now.getMonth(), 1);

    const aggregate = await prisma.transaction.aggregate({
        where: {
            status: TransactionStatus.PAID,
            referenceDate: { gte: start },
        },
        _sum: { amountCents: true },
    });

    return aggregate._sum.amountCents ?? 0;
}

export async function listSaasUsers(filters?: {
    accessStatus?: string;
    subscriptionStatus?: string;
}) {
    const accessStatus =
        filters?.accessStatus &&
        Object.values(UserAccessStatus).includes(
            filters.accessStatus as UserAccessStatus,
        )
            ? (filters.accessStatus as UserAccessStatus)
            : undefined;
    const subscriptionStatus =
        filters?.subscriptionStatus &&
        Object.values(SubscriptionStatus).includes(
            filters.subscriptionStatus as SubscriptionStatus,
        )
            ? (filters.subscriptionStatus as SubscriptionStatus)
            : undefined;

    return prisma.user.findMany({
        where: {
            role: UserRole.CUSTOMER,
            ...(accessStatus
                ? {
                      accessStatus,
                  }
                : {}),
            ...(subscriptionStatus
                ? {
                      subscription: {
                          is: {
                              status: subscriptionStatus,
                          },
                      },
                  }
                : {}),
        },
        include: {
            subscription: true,
            _count: {
                select: {
                    bots: true,
                    transactions: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });
}

export async function setSaasUserAccessStatus(
    userId: string,
    accessStatus: "ACTIVE" | "BANNED",
) {
    return prisma.user.update({
        where: { id: userId },
        data: { accessStatus },
    });
}

export async function setSaasUserAiLimitOverride(
    userId: string,
    aiMessageLimitOverride: number | null,
) {
    return prisma.user.update({
        where: { id: userId },
        data: {
            aiMessageLimitOverride,
        },
    });
}

async function findTransaction(referenceCandidates: string[]) {
    if (!referenceCandidates.length) {
        return null;
    }

    const orFilters: Prisma.TransactionWhereInput[] = [];

    for (const reference of referenceCandidates) {
        orFilters.push({ gatewayReference: reference });
        orFilters.push({
            rawPayload: {
                path: ["identifier"],
                equals: reference,
            },
        });
        orFilters.push({
            rawPayload: {
                path: ["externalReference"],
                equals: reference,
            },
        });
    }

    return prisma.transaction.findFirst({
        where: { OR: orFilters },
        orderBy: { createdAt: "desc" },
    });
}

async function resolveSubscription(input: {
    transaction: Transaction | null;
    parsedReference: { userId: string; planType: PlanType } | null;
    gatewaySubscriptionId: string | null;
}) {
    if (input.transaction?.subscriptionId) {
        return prisma.subscription.findUnique({
            where: { id: input.transaction.subscriptionId },
        });
    }

    if (input.gatewaySubscriptionId) {
        const subscription = await prisma.subscription.findUnique({
            where: { gatewaySubscriptionId: input.gatewaySubscriptionId },
        });

        if (subscription) {
            return subscription;
        }
    }

    if (input.parsedReference) {
        return prisma.subscription.findUnique({
            where: { userId: input.parsedReference.userId },
        });
    }

    return null;
}

async function markSuccess(input: {
    transaction: Transaction | null;
    subscription: Subscription | null;
    rawPayload: unknown;
    gatewaySubscriptionId: string | null;
    parsedReference: { userId: string; planType: PlanType } | null;
    data: UnknownRecord;
}) {
    let subscription = input.subscription;

    if (!subscription && input.parsedReference) {
        const plan = getPlanDefinition(input.parsedReference.planType);
        subscription = await prisma.subscription.upsert({
            where: { userId: input.parsedReference.userId },
            create: {
                userId: input.parsedReference.userId,
                planType: input.parsedReference.planType,
                status: SubscriptionStatus.ACTIVE,
                startDate: new Date(),
                endDate: addDays(new Date(), plan.cycleDays),
                planPriceCents: plan.priceCents,
                gatewaySubscriptionId: input.gatewaySubscriptionId,
            },
            update: {
                planType: input.parsedReference.planType,
                status: SubscriptionStatus.ACTIVE,
                startDate: new Date(),
                endDate: computeNextEndDate(
                    null,
                    input.parsedReference.planType,
                ),
                planPriceCents: plan.priceCents,
                graceUntil: null,
                gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
            },
        });
    }

    if (subscription) {
        subscription = await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
                status: SubscriptionStatus.ACTIVE,
                graceUntil: null,
                gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
                endDate: computeNextEndDate(
                    subscription.endDate,
                    subscription.planType,
                ),
            },
        });
    }

    if (input.transaction) {
        await prisma.transaction.update({
            where: { id: input.transaction.id },
            data: {
                status: TransactionStatus.PAID,
                paidAt: new Date(),
                referenceDate: new Date(),
                gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
                rawPayload: input.rawPayload as Prisma.InputJsonValue,
            },
        });
        return;
    }

    if (subscription) {
        await prisma.transaction.create({
            data: {
                userId: subscription.userId,
                subscriptionId: subscription.id,
                amountCents: getAmountCents(
                    input.data,
                    subscription.planPriceCents,
                ),
                status: TransactionStatus.PAID,
                paidAt: new Date(),
                gatewayReference:
                    getReferenceCandidates(input.data)[0] ??
                    buildExternalReference(
                        subscription.userId,
                        subscription.planType,
                    ),
                gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
                rawPayload: input.rawPayload as Prisma.InputJsonValue,
            },
        });
    }
}

async function markFailure(input: {
    transaction: Transaction | null;
    subscription: Subscription | null;
    rawPayload: unknown;
    gatewaySubscriptionId: string | null;
}) {
    if (input.transaction) {
        await prisma.transaction.update({
            where: { id: input.transaction.id },
            data: {
                status: TransactionStatus.FAILED,
                referenceDate: new Date(),
                gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
                rawPayload: input.rawPayload as Prisma.InputJsonValue,
            },
        });
    }

    if (input.subscription) {
        await prisma.subscription.update({
            where: { id: input.subscription.id },
            data: {
                status: SubscriptionStatus.PAST_DUE,
                graceUntil: addDays(new Date(), 3),
                gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
            },
        });
    }
}

async function markCanceled(input: {
    subscription: Subscription | null;
    gatewaySubscriptionId: string | null;
}) {
    if (!input.subscription) {
        return;
    }

    await prisma.subscription.update({
        where: { id: input.subscription.id },
        data: {
            status: SubscriptionStatus.CANCELED,
            graceUntil: null,
            gatewaySubscriptionId: input.gatewaySubscriptionId ?? undefined,
        },
    });
}

function normalizeStatus(status: unknown) {
    return String(status ?? "")
        .trim()
        .toLowerCase();
}

function normalizeEventType(
    payload: UnknownRecord,
    data: UnknownRecord,
) {
    return String(
        payload?.event ?? payload?.type ?? data?.event ?? data?.type ?? "",
    )
        .trim()
        .toLowerCase();
}

function isSuccessEvent(status: string, eventType: string) {
    return (
        [
            "paid",
            "pago",
            "aprovado",
            "pagamento_aprovado",
            "completed",
            "succeeded",
            "renewed",
            "active",
        ].includes(status) ||
        ["subscription.renewed", "subscription.activated"].includes(eventType)
    );
}

function isFailureEvent(status: string, eventType: string) {
    return (
        [
            "failed",
            "falhou",
            "past_due",
            "overdue",
            "late",
            "denied",
            "refused",
            "expired",
        ].includes(status) ||
        ["subscription.payment_failed", "subscription.past_due"].includes(
            eventType,
        )
    );
}

function isCancelEvent(status: string, eventType: string) {
    return (
        ["canceled", "cancelled", "inactive", "terminated"].includes(status) ||
        ["subscription.canceled"].includes(eventType)
    );
}

function getReferenceCandidates(data: UnknownRecord): string[] {
    return [
        data?.external_reference,
        data?.reference,
        data?.identifier,
        data?.id,
    ]
        .map((value) =>
            typeof value === "string" || typeof value === "number"
                ? String(value)
                : "",
        )
        .filter(Boolean);
}

function getGatewaySubscriptionId(data: UnknownRecord): string | null {
    const subscription = asRecord(data.subscription);
    const value =
        data?.subscription_id ??
        data?.gateway_subscription_id ??
        subscription.id;

    if (typeof value === "string" || typeof value === "number") {
        return String(value);
    }

    return null;
}

function parseExternalReference(
    references: string[],
): { userId: string; planType: PlanType } | null {
    const reference = references.find((value) => value.startsWith("saas_"));

    if (!reference) {
        return null;
    }

    const [, userId, planTypeRaw] = reference.split("_");
    const planType = Object.values(PlanType).find(
        (value) => value === planTypeRaw?.toUpperCase(),
    );

    if (!userId || !planType) {
        return null;
    }

    return {
        userId,
        planType,
    };
}

function computeNextEndDate(
    currentEndDate: Date | null,
    planType: PlanType,
): Date | null {
    const plan = getPlanDefinition(planType);

    if (plan.priceCents === 0) {
        return null;
    }

    const baseDate =
        currentEndDate && currentEndDate > new Date()
            ? currentEndDate
            : new Date();

    return addDays(baseDate, plan.cycleDays);
}

function getAmountCents(data: UnknownRecord, fallback: number) {
    const rawAmount = Number(data?.amount ?? fallback / 100);

    if (!Number.isFinite(rawAmount)) {
        return fallback;
    }

    return rawAmount > 1000 ? Math.round(rawAmount) : Math.round(rawAmount * 100);
}

function asRecord(value: unknown): UnknownRecord {
    return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function buildExternalReference(userId: string, planType: PlanType) {
    return `saas_${userId}_${planType}_${Date.now()}`;
}

function addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
