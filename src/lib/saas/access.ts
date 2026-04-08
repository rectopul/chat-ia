import {
    PlanType,
    Subscription,
    UserAccessStatus,
    UserRole,
} from "@prisma/client";
import { getPlanDefinition } from "./plans";

export function normalizeAiMessageLimitOverride(
    value?: number | null,
): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    const parsed = Math.trunc(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getEffectiveAiMessageLimitPerDay(input: {
    planType: PlanType;
    aiMessageLimitOverride?: number | null;
}): number | null {
    const override = normalizeAiMessageLimitOverride(
        input.aiMessageLimitOverride,
    );

    if (override !== null) {
        return override;
    }

    return getPlanDefinition(input.planType).messageLimitPerDay;
}

export function hasActiveSubscriptionAccess(input: {
    role: UserRole;
    accessStatus: UserAccessStatus;
    subscription: Subscription | null;
}): boolean {
    if (input.role === UserRole.SUPER_ADMIN) {
        return true;
    }

    if (input.accessStatus === UserAccessStatus.BANNED) {
        return false;
    }

    if (!input.subscription) {
        return false;
    }

    const now = new Date();

    if (input.subscription.status === "ACTIVE") {
        return !input.subscription.endDate || input.subscription.endDate >= now;
    }

    if (input.subscription.status === "PAST_DUE") {
        return (
            !!input.subscription.graceUntil &&
            input.subscription.graceUntil >= now
        );
    }

    if (input.subscription.status === "CANCELED") {
        return !!input.subscription.endDate && input.subscription.endDate >= now;
    }

    return false;
}

export function getAccessSummary(input: {
    role: UserRole;
    accessStatus: UserAccessStatus;
    subscription: Subscription | null;
    aiMessageLimitOverride?: number | null;
}) {
    const planType = input.subscription?.planType ?? PlanType.FREE;
    const plan = getPlanDefinition(planType);

    return {
        planType,
        plan,
        effectiveAiMessageLimitPerDay: getEffectiveAiMessageLimitPerDay({
            planType,
            aiMessageLimitOverride: input.aiMessageLimitOverride,
        }),
        isSuperAdmin: input.role === UserRole.SUPER_ADMIN,
        hasActiveAccess: hasActiveSubscriptionAccess(input),
    };
}
