import Link from "next/link";
import { ArrowRight, Cpu, MessageSquareText, Users } from "lucide-react";
import { requireSuperAdminUser } from "@/lib/server-session";
import { getAdminAiUsageDashboard } from "@/lib/admin-ai-usage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TokenUsageClientsTable from "@/components/admin/ai-usage/token-usage-clients-table";
import TokenUsageConversationsTable from "@/components/admin/ai-usage/token-usage-conversations-table";
import TokenUsageSummaryCards from "@/components/admin/ai-usage/token-usage-summary-cards";

export const runtime = "nodejs";

export default async function AdminAiUsagePage() {
    await requireSuperAdminUser();

    const aiUsage = await getAdminAiUsageDashboard();

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                    <Badge
                        variant="outline"
                        className="w-fit border-violet-200 bg-violet-50 text-violet-700"
                    >
                        Monitoramento Gemini
                    </Badge>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Consumo de tokens da IA
                    </h1>
                    <p className="max-w-2xl text-slate-500">
                        Tokens de prompt, saida e total registrados por
                        request. A visao abaixo consolida custo por cliente SaaS
                        e por conversa em todo o ecossistema.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline">
                        <Link href="/admin/dashboard">Voltar ao dashboard</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/admin/tenants">
                            Ver clientes SaaS
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>

            <TokenUsageSummaryCards totals={aiUsage.totals} />

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Cpu className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Registro por mensagem
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        Cada resposta da IA agora persiste `prompt`, `saida`,
                        `total` e o modelo usado direto no historico da
                        conversa.
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Visao por cliente SaaS
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        O ranking por cliente ajuda a identificar quais tenants
                        consomem mais IA e quais merecem revisao de plano ou
                        limite.
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <MessageSquareText className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Visao por conversa
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        Conversas com maior gasto acumulado ficam destacadas para
                        analise de prompt, contexto e qualidade operacional.
                    </CardContent>
                </Card>
            </div>

            <TokenUsageClientsTable rows={aiUsage.clients} />
            <TokenUsageConversationsTable rows={aiUsage.conversations} />
        </div>
    );
}
