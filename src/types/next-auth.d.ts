import "next-auth";
import "next-auth/jwt";
import {
    PlanType,
    SubscriptionStatus,
    UserAccessStatus,
    UserRole,
} from "@prisma/client";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            role?: UserRole;
            accessStatus?: UserAccessStatus;
            planType?: PlanType | null;
            subscriptionStatus?: SubscriptionStatus | null;
            hasActiveAccess?: boolean;
            isSuperAdmin?: boolean;
        };
    }

    interface User {
        id: string;
        role?: UserRole;
        accessStatus?: UserAccessStatus;
        planType?: PlanType | null;
        subscriptionStatus?: SubscriptionStatus | null;
        hasActiveAccess?: boolean;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        role?: UserRole;
        accessStatus?: UserAccessStatus;
        planType?: PlanType | null;
        subscriptionStatus?: SubscriptionStatus | null;
        hasActiveAccess?: boolean;
        isSuperAdmin?: boolean;
    }
}
