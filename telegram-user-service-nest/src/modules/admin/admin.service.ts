import { Injectable } from "@nestjs/common";
import {
    Prisma,
    SubscriptionStatus,
    TransactionStatus,
    UserAccessStatus,
    UserRole,
    WhatsappHandoverStatus,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminMonitoringService } from "./admin-monitoring.service";
import { SubscriptionService } from "../subscription/subscription.service";

type BalancePeriod = "daily" | "monthly";

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly subscriptionService: SubscriptionService,
        private readonly adminMonitoring: AdminMonitoringService,
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

        const [
            instanceHealth,
            processedMessagesByDay,
            openHandoverCount,
            recentHandovers,
        ] = await Promise.all([
            this.adminMonitoring.getInstanceHealth(),
            this.adminMonitoring.getProcessedMessagesByDay({}),
            this.prisma.whatsappHandover.count({
                where: { status: WhatsappHandoverStatus.OPEN },
            }),
            this.prisma.whatsappHandover.findMany({
                where: { status: WhatsappHandoverStatus.OPEN },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    whatsappInstance: {
                        select: {
                            id: true,
                            instanceName: true,
                            status: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 10,
            }),
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
            instanceHealth,
            handovers: {
                openCount: openHandoverCount,
                recent: recentHandovers,
            },
            monitoring: {
                processedMessagesByDay,
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
        planType?: Prisma.EnumPlanTypeFilter["equals"],
        from?: Date,
        to?: Date,
    ) {
        const overview = await this.adminMonitoring.getFinancialOverview({
            period,
            planType: planType as any,
            from,
            to,
        });

        return {
            ...overview,
            amountCents: overview.subscriptionRevenueCents,
        };
    }

    async getProcessedMessagesByDay(filters: {
        planType?: Prisma.EnumPlanTypeFilter["equals"];
        from?: Date;
        to?: Date;
    }) {
        return this.adminMonitoring.getProcessedMessagesByDay({
            planType: filters.planType as any,
            from: filters.from,
            to: filters.to,
        });
    }

    async getInstanceHealth() {
        return this.adminMonitoring.getInstanceHealth();
    }

    async getFinancialMonitoring(filters: {
        period: BalancePeriod;
        planType?: Prisma.EnumPlanTypeFilter["equals"];
        from?: Date;
        to?: Date;
    }) {
        return this.adminMonitoring.getFinancialOverview({
            period: filters.period,
            planType: filters.planType as any,
            from: filters.from,
            to: filters.to,
        });
    }

    getOpenApiDocument() {
        return this.adminMonitoring.getOpenApiDocument();
    }

    getSwaggerHtml(specPath: string) {
        return this.adminMonitoring.getSwaggerHtml(specPath);
    }
}
