import {
    ForbiddenException,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import {
    ChatMessageRole,
    PlanType,
    Prisma,
    Subscription,
    SubscriptionStatus,
    User,
    UserAccessStatus,
    UserRole,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
    SaasPlanDefinition,
    getSaasPlan,
    getSaasPlanCatalog,
} from "./plan-catalog";

type UserWithSubscription = User & {
    subscription: Subscription | null;
    bots: Array<{ id: string }>;
};

export type UserAccessSnapshot = {
    userId: string;
    role: UserRole;
    accessStatus: UserAccessStatus;
    subscription: Subscription | null;
    plan: SaasPlanDefinition;
    hasActiveAccess: boolean;
    isSuperAdmin: boolean;
    botIds: string[];
};

export type AiAccessDecision = {
    allowed: boolean;
    planType: PlanType;
    remainingToday: number | null;
    reason?: string;
};

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(private readonly prisma: PrismaService) {}

    getPlanCatalog(): SaasPlanDefinition[] {
        return getSaasPlanCatalog();
    }

    async getUserAccessSnapshot(
        userId: string,
    ): Promise<UserAccessSnapshot | null> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                subscription: true,
                bots: {
                    select: { id: true },
                },
            },
        });

        if (!user) {
            return null;
        }

        return this.buildSnapshot(user);
    }

    async requireActiveUserAccess(userId: string): Promise<UserAccessSnapshot> {
        const snapshot = await this.getUserAccessSnapshot(userId);

        if (!snapshot) {
            throw new UnauthorizedException("User not found");
        }

        if (snapshot.isSuperAdmin) {
            return snapshot;
        }

        if (!snapshot.hasActiveAccess) {
            throw new ForbiddenException("Active subscription required");
        }

        return snapshot;
    }

    async getAiAccessDecision(botId: string): Promise<AiAccessDecision> {
        const bot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
            include: {
                ownerUser: {
                    include: {
                        subscription: true,
                        bots: {
                            select: { id: true },
                        },
                    },
                },
            },
        });

        if (!bot?.ownerUser) {
            return {
                allowed: true,
                planType: PlanType.ENTERPRISE,
                remainingToday: null,
                reason: "legacy-unowned-bot",
            };
        }

        const snapshot = this.buildSnapshot(bot.ownerUser);

        if (!snapshot.hasActiveAccess && !snapshot.isSuperAdmin) {
            return {
                allowed: false,
                planType: snapshot.plan.planType,
                remainingToday: 0,
                reason: "inactive-subscription",
            };
        }

        if (snapshot.isSuperAdmin) {
            return {
                allowed: true,
                planType: snapshot.plan.planType,
                remainingToday: null,
            };
        }

        if (snapshot.plan.messageLimitPerDay === null) {
            return {
                allowed: true,
                planType: snapshot.plan.planType,
                remainingToday: null,
            };
        }

        const usedToday = await this.prisma.chatMessage.count({
            where: {
                botId: {
                    in: snapshot.botIds.length ? snapshot.botIds : [botId],
                },
                role: ChatMessageRole.user,
                createdAt: {
                    gte: this.getStartOfToday(),
                },
            },
        });

        const remainingToday = Math.max(
            snapshot.plan.messageLimitPerDay - usedToday,
            0,
        );

        return {
            allowed: remainingToday > 0,
            planType: snapshot.plan.planType,
            remainingToday,
            reason: remainingToday > 0 ? undefined : "daily-message-limit",
        };
    }

    async assertAiAccess(botId: string): Promise<void> {
        const decision = await this.getAiAccessDecision(botId);

        if (!decision.allowed) {
            this.logger.warn(
                `[assertAiAccess] blocked botId=${botId} plan=${decision.planType} reason=${decision.reason}`,
            );
            throw new ForbiddenException(
                `AI access blocked: ${decision.reason ?? "subscription-check"}`,
            );
        }
    }

    hasActiveAccess(
        role: UserRole,
        accessStatus: UserAccessStatus,
        subscription: Subscription | null,
    ): boolean {
        if (role === UserRole.SUPER_ADMIN) {
            return true;
        }

        if (accessStatus === UserAccessStatus.BANNED) {
            return false;
        }

        if (!subscription) {
            return false;
        }

        const now = new Date();

        if (subscription.status === SubscriptionStatus.ACTIVE) {
            return !subscription.endDate || subscription.endDate >= now;
        }

        if (subscription.status === SubscriptionStatus.PAST_DUE) {
            return !!subscription.graceUntil && subscription.graceUntil >= now;
        }

        if (subscription.status === SubscriptionStatus.CANCELED) {
            return !!subscription.endDate && subscription.endDate >= now;
        }

        return false;
    }

    private buildSnapshot(user: UserWithSubscription): UserAccessSnapshot {
        const planType = user.subscription?.planType ?? PlanType.FREE;

        return {
            userId: user.id,
            role: user.role,
            accessStatus: user.accessStatus,
            subscription: user.subscription,
            plan: getSaasPlan(planType),
            hasActiveAccess: this.hasActiveAccess(
                user.role,
                user.accessStatus,
                user.subscription,
            ),
            isSuperAdmin: user.role === UserRole.SUPER_ADMIN,
            botIds: user.bots.map((bot) => bot.id),
        };
    }

    private getStartOfToday(): Date {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return start;
    }
}
