import { prisma } from "@/lib/prisma";
import { SaleStatus } from "@prisma/client";
import {
    Users,
    CreditCard,
    TrendingUp,
    ArrowRight,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ChevronRight,
    Zap,
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import * as motion from "framer-motion/client";
import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

type BotStatusItem = {
    key: string;
    label: string;
    description: string;
    ok: boolean;
    critical: boolean;
};

type BotStatusResponse = {
    allCriticalOk: boolean;
    items: BotStatusItem[];
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getBotStatus(): Promise<BotStatusResponse> {
    const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
        console.error(
            "[getBotStatus] API_URL não definida nas variáveis de ambiente",
        );
        return { allCriticalOk: false, items: [] };
    }

    const url = `${apiUrl}/telegram/bot-status`;

    try {
        const res = await fetch(url, { cache: "no-store" });

        if (!res.ok) {
            console.error(`[getBotStatus] HTTP ${res.status} em ${url}`);
            return { allCriticalOk: false, items: [] };
        }

        const data: BotStatusResponse = await res.json();
        return data;
    } catch (err) {
        console.error("[getBotStatus] erro na requisição:", err);
        return { allCriticalOk: false, items: [] };
    }
}

// ─── Bot Status Section ───────────────────────────────────────────────────────

function BotStatusSection({ status }: { status: BotStatusResponse }) {
    const criticalItems = status.items.filter((i) => i.critical);
    const optionalItems = status.items.filter((i) => !i.critical);
    const criticalDone = criticalItems.filter((i) => i.ok).length;
    const criticalTotal = criticalItems.length;
    const progressPct =
        criticalTotal > 0 ? (criticalDone / criticalTotal) * 100 : 0;

    return (
        <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div
                            className={`p-2 rounded-lg ${
                                status.allCriticalOk
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-amber-50 text-amber-600"
                            }`}
                        >
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <CardTitle className="text-base font-semibold text-slate-900">
                                Status de Configuração do Bot
                            </CardTitle>
                            <CardDescription className="mt-0.5">
                                {status.allCriticalOk
                                    ? "Todas as configurações essenciais estão OK. Seu bot está pronto."
                                    : `${criticalTotal - criticalDone} configuração(ões) essencial(is) pendente(s).`}
                            </CardDescription>
                        </div>
                    </div>

                    <Badge
                        className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                            status.allCriticalOk
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : "bg-amber-100 text-amber-700 border-amber-200"
                        }`}
                        variant="outline"
                    >
                        {criticalDone}/{criticalTotal} essenciais
                    </Badge>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${
                                status.allCriticalOk
                                    ? "bg-emerald-500"
                                    : "bg-amber-400"
                            }`}
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-2 pt-0">
                {/* Critical items */}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
                    Essenciais
                </p>
                {criticalItems.map((item) => (
                    <StatusItem key={item.key} item={item} />
                ))}

                {/* Optional items */}
                {optionalItems.length > 0 && (
                    <>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4 mb-1 px-1 pt-2">
                            Opcionais
                        </p>
                        {optionalItems.map((item) => (
                            <StatusItem key={item.key} item={item} />
                        ))}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function StatusItem({ item }: { item: BotStatusItem }) {
    return (
        <div
            className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                item.ok
                    ? "bg-slate-50 border-slate-100"
                    : item.critical
                      ? "bg-red-50 border-red-100"
                      : "bg-slate-50 border-slate-100"
            }`}
        >
            <div className="mt-0.5 shrink-0">
                {item.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : item.critical ? (
                    <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                    <AlertCircle className="w-4 h-4 text-slate-300" />
                )}
            </div>
            <div className="min-w-0">
                <p
                    className={`text-sm font-medium leading-tight ${
                        item.ok
                            ? "text-slate-700"
                            : item.critical
                              ? "text-red-700"
                              : "text-slate-500"
                    }`}
                >
                    {item.label}
                </p>
                {!item.ok && (
                    <p className="text-xs text-slate-500 mt-1 leading-snug">
                        {item.description}
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default async function AdminDashboard() {
    const [stats, botStatus] = await Promise.all([
        prisma.$transaction([
            prisma.telegramUser.count(),
            prisma.sale.count({ where: { status: SaleStatus.PAID } }),
            prisma.sale.aggregate({
                where: { status: SaleStatus.PAID },
                _sum: { amountCents: true },
            }),
        ]),
        getBotStatus(),
    ]);

    const [totalUsers, totalSales, totalRevenue] = stats;

    const cards = [
        {
            title: "Total de Usuários",
            value: totalUsers,
            description: "Usuários únicos capturados",
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-50",
        },
        {
            title: "Vendas Confirmadas",
            value: totalSales,
            description: "Transações pagas com sucesso",
            icon: CreditCard,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
        },
        {
            title: "Receita Total",
            value: `R$ ${(
                (totalRevenue._sum.amountCents || 0) / 100
            ).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            description: "Faturamento bruto acumulado",
            icon: TrendingUp,
            color: "text-amber-600",
            bg: "bg-amber-50",
        },
    ];

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    Visão Geral
                </h1>
                <p className="text-slate-500">
                    Acompanhe o desempenho dos seus bots e vendas em tempo real.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3, delay: i * 0.1 }}
                    >
                        <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                                <CardTitle className="text-sm font-medium text-slate-600">
                                    {card.title}
                                </CardTitle>
                                <div
                                    className={`${card.bg} ${card.color} p-2 rounded-lg`}
                                >
                                    <card.icon className="w-4 h-4" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-slate-900">
                                    {card.value}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {card.description}
                                </p>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Bot Status Checklist */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
            >
                <BotStatusSection status={botStatus} />
            </motion.div>

            {/* Quick Actions */}
            <Card className="border-none shadow-sm bg-white">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Ações Rápidas</CardTitle>
                            <CardDescription>
                                Filtros de usuários por inatividade de compra.
                            </CardDescription>
                        </div>
                        <Clock className="w-5 h-5 text-slate-400" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-4">
                        {[
                            {
                                label: "Sem compra (3 dias)",
                                href: "/admin/users?filter=no_purchase_3d",
                            },
                            {
                                label: "Sem compra (7 dias)",
                                href: "/admin/users?filter=no_purchase_7d",
                            },
                            {
                                label: "Sem compra (30 dias)",
                                href: "/admin/users?filter=no_purchase_30d",
                            },
                        ].map((action, i) => (
                            <Link key={i} href={action.href}>
                                <Button
                                    variant="outline"
                                    className="border-slate-200 hover:bg-slate-50 hover:text-primary transition-all group"
                                >
                                    {action.label}
                                    <ArrowRight className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                                </Button>
                            </Link>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
