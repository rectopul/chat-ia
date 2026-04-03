import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getAccessSummary } from "@/lib/saas/access";
import { getUserAiUsageToday, getUserWithSaasContext } from "@/lib/saas/server";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlanDefinition } from "@/lib/saas/plans";
import { Bot, CreditCard, Gauge, Sparkles } from "lucide-react";
import Link from "next/link";

function formatMoney(valueCents: number) {
    return `R$ ${(valueCents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
    })}`;
}

export default async function UserDashboardPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const user = await getUserWithSaasContext(session.user.id);

    if (!user) {
        redirect("/login");
    }

    const access = getAccessSummary({
        role: user.role,
        accessStatus: user.accessStatus,
        subscription: user.subscription,
    });
    const usageToday = await getUserAiUsageToday(user.id);
    const plan = getPlanDefinition(access.planType);

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                    Ola, {user.name || user.email || "cliente"}
                </h2>
                <p className="text-slate-500">
                    Aqui voce acompanha o plano ativo, consumo diario da IA e
                    seus ultimos pagamentos.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardDescription>Plano atual</CardDescription>
                        <CardTitle className="text-3xl">{plan.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <Badge variant="outline">{user.subscription?.status || "SEM ASSINATURA"}</Badge>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardDescription>Valor do ciclo</CardDescription>
                        <CardTitle className="text-3xl">
                            {formatMoney(user.subscription?.planPriceCents || plan.priceCents)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        Renovacao baseada no plano atual.
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardDescription>Consumo diario de IA</CardDescription>
                        <CardTitle className="text-3xl">
                            {plan.messageLimitPerDay === null
                                ? "Ilimitado"
                                : `${usageToday}/${plan.messageLimitPerDay}`}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        Limite contabilizado por tenant para mensagens da IA.
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardDescription>Bots vinculados</CardDescription>
                        <CardTitle className="text-3xl">{user.bots.length}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        Contas do Telegram sob este tenant.
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-none shadow-sm lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Gauge className="w-5 h-5 text-primary" />
                            <CardTitle>Status do acesso</CardTitle>
                        </div>
                        <CardDescription>
                            Assinatura, grace period e acesso ao produto.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-sm font-medium text-slate-600">
                                {access.hasActiveAccess
                                    ? "Seu acesso esta liberado."
                                    : "Seu acesso precisa de uma assinatura ativa ou em grace period."}
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                                Expira em{" "}
                                <strong className="text-slate-700">
                                    {user.subscription?.endDate
                                        ? user.subscription.endDate.toLocaleDateString("pt-BR")
                                        : "sem data definida"}
                                </strong>
                                {user.subscription?.graceUntil && (
                                    <>
                                        {" "}
                                        e o grace period vai ate{" "}
                                        <strong className="text-slate-700">
                                            {user.subscription.graceUntil.toLocaleDateString(
                                                "pt-BR",
                                            )}
                                        </strong>
                                    </>
                                )}
                                .
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button asChild>
                                <Link href="/billing">Gerenciar plano</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-primary" />
                            <CardTitle>Ultimos pagamentos</CardTitle>
                        </div>
                        <CardDescription>
                            Historico recente do tenant.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {user.transactions.map((transaction) => (
                            <div
                                key={transaction.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {formatMoney(transaction.amountCents)}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {transaction.referenceDate.toLocaleDateString("pt-BR")}
                                        </p>
                                    </div>
                                    <Badge variant="outline">{transaction.status}</Badge>
                                </div>
                            </div>
                        ))}
                        {user.transactions.length === 0 && (
                            <p className="text-sm text-slate-500">
                                Ainda nao ha transacoes para esta conta.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-primary" />
                        <CardTitle>Suas contas do Telegram</CardTitle>
                    </div>
                    <CardDescription>
                        Bots e contas vinculados ao tenant.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {user.bots.map((bot) => (
                        <div
                            key={bot.id}
                            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"
                        >
                            <div>
                                <p className="font-semibold text-slate-900">
                                    {bot.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {bot.phoneNumber || bot.id}
                                </p>
                            </div>
                            <Badge variant={bot.isActive ? "default" : "outline"}>
                                {bot.isActive ? "ATIVO" : "INATIVO"}
                            </Badge>
                        </div>
                    ))}
                    {user.bots.length === 0 && (
                        <p className="text-sm text-slate-500">
                            Nenhum bot vinculado a este cliente ainda.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
