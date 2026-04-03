import { PlanType } from "@prisma/client";

export type FrontendPlanDefinition = {
    planType: PlanType;
    name: string;
    description: string;
    priceCents: number;
    cycleDays: number;
    messageLimitPerDay: number | null;
    features: string[];
    ctaLabel: string;
};

function parsePrice(name: string, fallback: number): number {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

const PLAN_CATALOG: Record<PlanType, FrontendPlanDefinition> = {
    FREE: {
        planType: PlanType.FREE,
        name: "Free",
        description: "Valide a operacao e conheca o produto com limite diario.",
        priceCents: 0,
        cycleDays: 30,
        messageLimitPerDay: 10,
        features: [
            "Ate 10 mensagens de IA por dia",
            "1 tenant com operacao inicial",
            "Acesso ao billing e painel basico",
        ],
        ctaLabel: "Ativar Free",
    },
    BASIC: {
        planType: PlanType.BASIC,
        name: "Basic",
        description: "Para iniciar automacoes com um volume estavel.",
        priceCents: parsePrice("SAAS_BASIC_PRICE_CENTS", 4900),
        cycleDays: 30,
        messageLimitPerDay: 200,
        features: [
            "Ate 200 mensagens de IA por dia",
            "Pix de checkout do proprio plano",
            "Dashboard de operacao do cliente",
        ],
        ctaLabel: "Assinar Basic",
    },
    PRO: {
        planType: PlanType.PRO,
        name: "Pro",
        description: "Plano principal para operar sem limite diario de IA.",
        priceCents: parsePrice("SAAS_PRO_PRICE_CENTS", 9900),
        cycleDays: 30,
        messageLimitPerDay: null,
        features: [
            "IA ilimitada por dia",
            "Painel completo do cliente",
            "Webhook e cobranca recorrente preparados",
        ],
        ctaLabel: "Assinar Pro",
    },
    ENTERPRISE: {
        planType: PlanType.ENTERPRISE,
        name: "Enterprise",
        description: "Estrutura premium para operacao maior e suporte dedicado.",
        priceCents: parsePrice("SAAS_ENTERPRISE_PRICE_CENTS", 19900),
        cycleDays: 30,
        messageLimitPerDay: null,
        features: [
            "IA ilimitada",
            "Operacao premium multi bot",
            "Prioridade administrativa",
        ],
        ctaLabel: "Assinar Enterprise",
    },
};

export function getPlanCatalog(): FrontendPlanDefinition[] {
    return [
        PLAN_CATALOG.FREE,
        PLAN_CATALOG.BASIC,
        PLAN_CATALOG.PRO,
        PLAN_CATALOG.ENTERPRISE,
    ];
}

export function getPlanDefinition(planType: PlanType): FrontendPlanDefinition {
    return PLAN_CATALOG[planType];
}
