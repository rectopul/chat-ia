import { PlanType } from "@prisma/client";

export type SaasPlanDefinition = {
    planType: PlanType;
    name: string;
    description: string;
    priceCents: number;
    cycleDays: number;
    messageLimitPerDay: number | null;
};

function parsePrice(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

const PLAN_CATALOG: Record<PlanType, SaasPlanDefinition> = {
    FREE: {
        planType: PlanType.FREE,
        name: "Free",
        description: "Entrada com limite diario para validar o produto.",
        priceCents: 0,
        cycleDays: 30,
        messageLimitPerDay: 10,
    },
    BASIC: {
        planType: PlanType.BASIC,
        name: "Basic",
        description: "Operacao inicial com automacao moderada.",
        priceCents: parsePrice("SAAS_BASIC_PRICE_CENTS", 4900),
        cycleDays: 30,
        messageLimitPerDay: 200,
    },
    PRO: {
        planType: PlanType.PRO,
        name: "Pro",
        description: "Operacao completa com IA sem limite diario.",
        priceCents: parsePrice("SAAS_PRO_PRICE_CENTS", 9900),
        cycleDays: 30,
        messageLimitPerDay: null,
    },
    ENTERPRISE: {
        planType: PlanType.ENTERPRISE,
        name: "Enterprise",
        description: "Plano premium para alto volume e operacao dedicada.",
        priceCents: parsePrice("SAAS_ENTERPRISE_PRICE_CENTS", 19900),
        cycleDays: 30,
        messageLimitPerDay: null,
    },
};

export function getSaasPlan(planType: PlanType): SaasPlanDefinition {
    return PLAN_CATALOG[planType];
}

export function getSaasPlanCatalog(): SaasPlanDefinition[] {
    return [
        PLAN_CATALOG.FREE,
        PLAN_CATALOG.BASIC,
        PLAN_CATALOG.PRO,
        PLAN_CATALOG.ENTERPRISE,
    ];
}

export function normalizeSaasAiLimitOverride(
    value?: number | null,
): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    const parsed = Math.trunc(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getEffectiveSaasAiMessageLimit(input: {
    planType: PlanType;
    aiMessageLimitOverride?: number | null;
}): number | null {
    const override = normalizeSaasAiLimitOverride(
        input.aiMessageLimitOverride,
    );

    if (override !== null) {
        return override;
    }

    return getSaasPlan(input.planType).messageLimitPerDay;
}
