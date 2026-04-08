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
import {
    ArrowRight,
    Bike,
    Bot,
    CreditCard,
    Gauge,
    MessageCircle,
    MessageSquare,
    ShoppingBag,
    Sparkles,
    Users,
} from "lucide-react";
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
        aiMessageLimitOverride: user.aiMessageLimitOverride,
    });
    const usageToday = await getUserAiUsageToday(user.id);
    const plan = getPlanDefinition(access.planType);
    const toolCards = [
        {
            href: "/dashboard/bots",
            label: "Telegram",
            description: "Gerencie contas e conexoes do Telegram.",
            value: user._count.bots,
            icon: Bot,
        },
        {
            href: "/dashboard/whatsapp",
            label: "WhatsApp",
            description: "Configure instancias e prepare a operacao.",
            value: user._count.whatsappInstances,
            icon: MessageCircle,
        },
        {
            href: "/dashboard/customers",
            label: "Clientes",
            description: "Veja os contatos capturados somente no seu tenant.",
            value: user._count.whatsappCustomers,
            icon: Users,
        },
        {
            href: "/dashboard/messages",
            label: "Conteudos",
            description: "Ajuste templates, gatilhos e midias.",
            value: user._count.templates,
            icon: MessageSquare,
        },
        {
            href: "/dashboard/products",
            label: "Produtos",
            description: "Atualize catalogo, categoria e estoque.",
            value: user._count.products,
            icon: ShoppingBag,
        },
        {
            href: "/dashboard/orders",
            label: "Pedidos",
            description: "Acompanhe o delivery em tempo real.",
            value: user._count.orders,
            icon: Bike,
        },
        {
            href: "/billing",
            label: "Billing",
            description: "Consulte plano, cobranca e pagamentos.",
            value: user.transactions.length,
            icon: CreditCard,
        },
    ];

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
                            {access.effectiveAiMessageLimitPerDay === null
                                ? "Ilimitado"
                                : `${usageToday}/${access.effectiveAiMessageLimitPerDay}`}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        {user.aiMessageLimitOverride === null
                            ? "Limite contabilizado pelo plano atual."
                            : "Limite customizado manualmente para este tenant."}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardDescription>Canais conectados</CardDescription>
                        <CardTitle className="text-3xl">
                            {user._count.bots + user._count.whatsappInstances}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        Telegram e WhatsApp vinculados a este tenant.
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        <CardTitle>Ferramentas do cliente</CardTitle>
                    </div>
                    <CardDescription>
                        Atalhos rapidos para tudo o que o tenant pode operar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {toolCards.map((tool) => (
                        <Link
                            key={tool.href}
                            href={tool.href}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-primary/30 hover:bg-white"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <tool.icon className="w-5 h-5 text-primary" />
                                        <span className="font-semibold text-slate-900">
                                            {tool.label}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500">
                                        {tool.description}
                                    </p>
                                </div>
                                <Badge variant="outline">{tool.value}</Badge>
                            </div>
                            <div className="mt-4 flex items-center text-sm font-medium text-primary">
                                Abrir ferramenta
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </div>
                        </Link>
                    ))}
                </CardContent>
            </Card>

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
