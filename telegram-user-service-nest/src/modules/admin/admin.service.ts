import { Injectable } from "@nestjs/common";
import {
    Prisma,
    SubscriptionStatus,
    TransactionStatus,
    UserAccessStatus,
    UserRole,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SubscriptionService } from "../subscription/subscription.service";

type BalancePeriod = "daily" | "monthly";

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly subscriptionService: SubscriptionService,
    ) {}

    async getDashboardMetrics() {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thirtyDaysAgo = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000,
        );

        const [users, paidTransactions, legacySales] = await Promise.all([
            this.prisma.user.findMany({
                where: { role: UserRole.CUSTOMER },
                include: { subscription: true },
            }),
            this.prisma.transaction.findMany({
                where: { status: TransactionStatus.PAID },
                select: {
                    amountCents: true,
                    referenceDate: true,
                },
            }),
            this.prisma.sale.aggregate({
                where: { status: "PAID" },
                _sum: { amountCents: true },
            }),
        ]);

        const activeUsers = users.filter((user) =>
            this.subscriptionService.hasActiveAccess(
                user.role,
                user.accessStatus,
                user.subscription,
            ),
        );
        const activePaidSubscriptions = activeUsers.filter(
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

        const mrrCents = activePaidSubscriptions.reduce(
            (sum, user) => sum + (user.subscription?.planPriceCents ?? 0),
            0,
        );
        const paidInMonthCents = paidTransactions
            .filter((transaction) => transaction.referenceDate >= monthStart)
            .reduce((sum, transaction) => sum + transaction.amountCents, 0);
        const totalRevenueCents = paidTransactions.reduce(
            (sum, transaction) => sum + transaction.amountCents,
            0,
        );
        const churnBase = activePaidSubscriptions.length + canceledInWindow;
        const churnRate = churnBase
            ? Number(((canceledInWindow / churnBase) * 100).toFixed(2))
            : 0;

        const [dailyBalance, monthlyBalance] = await Promise.all([
            this.getBalance("daily"),
            this.getBalance("monthly"),
        ]);

        return {
            mrrCents,
            churnRate,
            activeUsers: activeUsers.length,
            totalRevenueCents,
            paidInMonthCents,
            legacySalesRevenueCents: legacySales._sum.amountCents ?? 0,
            balance: {
                daily: dailyBalance,
                monthly: monthlyBalance,
            },
        };
    }

    async listUsers(filters: {
        accessStatus?: UserAccessStatus;
        subscriptionStatus?: SubscriptionStatus;
    }) {
        const where: Prisma.UserWhereInput = {
            role: UserRole.CUSTOMER,
            ...(filters.accessStatus
                ? { accessStatus: filters.accessStatus }
                : {}),
            ...(filters.subscriptionStatus
                ? {
                      subscription: {
                          is: {
                              status: filters.subscriptionStatus,
                          },
                      },
                  }
                : {}),
        };

        return this.prisma.user.findMany({
            where,
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

    async setUserAccessStatus(
        userId: string,
        accessStatus: UserAccessStatus,
    ) {
        return this.prisma.user.update({
            where: { id: userId },
            data: { accessStatus },
        });
    }

    async getBalance(
        period: BalancePeriod,
        from?: Date,
        to?: Date,
    ): Promise<{ period: BalancePeriod; amountCents: number }> {
        const now = new Date();
        const defaultFrom =
            period === "daily"
                ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
                : new Date(now.getFullYear(), now.getMonth(), 1);

        const aggregate = await this.prisma.transaction.aggregate({
            where: {
                status: TransactionStatus.PAID,
                referenceDate: {
                    gte: from ?? defaultFrom,
                    ...(to ? { lte: to } : {}),
                },
            },
            _sum: { amountCents: true },
        });

        return {
            period,
            amountCents: aggregate._sum.amountCents ?? 0,
        };
    }
}
