import { getAdminSaasMetrics, getBalanceSnapshot } from "@/lib/saas/server";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Activity,
    ArrowRight,
    BarChart3,
    CreditCard,
    DollarSign,
    TrendingDown,
    Users,
} from "lucide-react";
import Link from "next/link";

function formatMoney(valueCents: number) {
    return `R$ ${(valueCents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
    })}`;
}

export default async function AdminDashboardPage() {
    const [metrics, dailyBalance, monthlyBalance] = await Promise.all([
        getAdminSaasMetrics(),
        getBalanceSnapshot("daily"),
        getBalanceSnapshot("monthly"),
    ]);

    const cards = [
        {
            title: "MRR",
            value: formatMoney(metrics.mrrCents),
            description: "Receita recorrente mensal ativa",
            icon: DollarSign,
        },
        {
            title: "Receita Total",
            value: formatMoney(metrics.totalRevenueCents),
            description: "Somatorio das transacoes SaaS pagas",
            icon: CreditCard,
        },
        {
            title: "Clientes Ativos",
            value: String(metrics.activeUsers),
            description: "Tenants com acesso liberado",
            icon: Users,
        },
        {
            title: "Churn 30d",
            value: `${metrics.churnRate.toFixed(2)}%`,
            description: "Taxa de cancelamento da janela recente",
            icon: TrendingDown,
        },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                    <Badge
                        variant="outline"
                        className="w-fit border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                        SaaS Overview
                    </Badge>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Dashboard Administrativo
                    </h1>
                    <p className="text-slate-500 max-w-2xl">
                        Receita recorrente, churn e balanco geral da operacao
                        SaaS em um unico lugar.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button asChild variant="outline">
                        <Link href="/admin/tenants">Gerenciar clientes</Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/admin/ai-usage">Consumo IA</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/admin/bots">
                            Ver tenants e bots
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => (
                    <Card key={card.title} className="border-none shadow-sm">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardDescription>{card.title}</CardDescription>
                                <div className="rounded-full bg-slate-100 p-2 text-slate-600">
                                    <card.icon className="w-4 h-4" />
                                </div>
                            </div>
                            <CardTitle className="text-3xl font-bold text-slate-900">
                                {card.value}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-sm text-slate-500">
                            {card.description}
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-none shadow-sm lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-primary" />
                            <CardTitle>Resumo Financeiro</CardTitle>
                        </div>
                        <CardDescription>
                            Balanco acumulado do SaaS e receita operacional
                            existente.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                Hoje
                            </p>
                            <p className="mt-3 text-2xl font-bold text-slate-900">
                                {formatMoney(dailyBalance)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                Mês atual
                            </p>
                            <p className="mt-3 text-2xl font-bold text-slate-900">
                                {formatMoney(monthlyBalance)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                Operacao legacy
                            </p>
                            <p className="mt-3 text-2xl font-bold text-slate-900">
                                {formatMoney(metrics.legacySalesRevenueCents)}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            <CardTitle>Planos</CardTitle>
                        </div>
                        <CardDescription>
                            Catalogo de planos carregado para o checkout.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {metrics.plans.map((plan) => (
                            <div
                                key={plan.planType}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {plan.name}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {plan.description}
                                        </p>
                                    </div>
                                    <Badge variant="secondary">
                                        {plan.priceCents === 0
                                            ? "Gratis"
                                            : formatMoney(plan.priceCents)}
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
