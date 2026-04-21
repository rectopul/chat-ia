import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { getPlanCatalog } from "@/lib/saas/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    ArrowRight,
    Bot,
    Cable,
    CheckCircle2,
    CreditCard,
    Crown,
    MessageCircle,
    MessagesSquare,
    Package2,
    QrCode,
    Settings2,
    ShoppingCart,
    Store,
    Truck,
    UserRound,
    WalletCards,
} from "lucide-react";

export const metadata: Metadata = {
    title: "Bot Admin Pro | IA para WhatsApp, Telegram e Delivery",
    description:
        "Automatize atendimento, catalogo, pedidos, checkout, clientes e operacao da sua loja em um unico painel com IA.",
};

const capabilityCards = [
    {
        icon: MessageCircle,
        title: "WhatsApp pronto para vender",
        description:
            "Conecte a loja por QR Code e deixe a IA atender, montar carrinho, confirmar endereco e conduzir o checkout.",
    },
    {
        icon: CreditCard,
        title: "Checkout completo",
        description:
            "Pix online, Pix na entrega, cartao com o entregador, dinheiro com troco, entrega ou retirada no local.",
    },
    {
        icon: Package2,
        title: "Catalogo comercial",
        description:
            "Produtos com categorias, tags, imagem, promocao, estoque e contexto inteligente para recomendacoes por perfil.",
    },
    {
        icon: Settings2,
        title: "Operacao configuravel",
        description:
            "Horarios, mensagem de ausencia, fechamento manual, taxa de entrega e perfil do negocio ajustados pelo painel.",
    },
    {
        icon: UserRound,
        title: "Clientes e historico",
        description:
            "Cada assinante acompanha sua propria base de clientes capturados, pedidos e conversas sem misturar tenants.",
    },
    {
        icon: MessagesSquare,
        title: "Mensagens e campanhas",
        description:
            "Templates, agendamentos, automacoes e estrutura para campanhas e comunicacao recorrente em um unico ambiente.",
    },
];

const operationSteps = [
    {
        step: "01",
        title: "Configure a loja",
        description:
            "Defina nome do atendente, perfil do negocio, endereco, meios de pagamento, entrega ou retirada e horarios.",
    },
    {
        step: "02",
        title: "Conecte o WhatsApp",
        description:
            "Abra o modal de conexao, gere o QR Code e pareie o numero da loja com a Evolution sem setup tecnico manual.",
    },
    {
        step: "03",
        title: "A IA atende e vende",
        description:
            "O sistema entende pedidos, busca produtos, soma itens no carrinho, pergunta o que falta e reduz repeticao no chat.",
    },
    {
        step: "04",
        title: "O painel organiza a operacao",
        description:
            "Pedidos, clientes, produtos, mensagens, cobrancas e configuracoes ficam centralizados para o lojista operar.",
    },
];

const nicheCards = [
    {
        icon: Store,
        title: "Mercearias e delivery",
        description:
            "Fluxo forte para itens unitarios, quantidade, endereco, entrega, retirada, taxa e pagamento na entrega.",
    },
    {
        icon: ShoppingCart,
        title: "Lojas com catalogo vivo",
        description:
            "Produtos com tags, imagens e preco promocional ajudam a IA a recomendar e montar ofertas com mais contexto.",
    },
    {
        icon: Cable,
        title: "Operacoes com varios modulos",
        description:
            "WhatsApp, Telegram, billing, campanhas, handover humano e administracao do SaaS na mesma plataforma.",
    },
];

const trustPoints = [
    "4 perfis de negocio para ajustar o tom da IA",
    "4 formas de pagamento prontas para checkout",
    "2 modalidades de atendimento: entrega e retirada",
    "Clientes, pedidos e catalogo separados por assinante",
];

function formatMoney(valueCents: number) {
    return `R$ ${(valueCents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
    })}`;
}

export default async function HomePage() {
    const session = await auth();
    const plans = getPlanCatalog();
    const panelHref = session?.user?.id
        ? session.user.isSuperAdmin
            ? "/admin/dashboard"
            : "/dashboard"
        : "/login";
    const primaryPlanCtaHref = session?.user?.id ? "/billing" : "/register";

    return (
        <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f7fbff_0%,#eef5ff_24%,#f8fafc_58%,#ffffff_100%)] text-slate-900">
            <div className="relative isolate">
                <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] overflow-hidden">
                    <div className="absolute left-1/2 top-[-180px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(14,116,255,0.20),rgba(14,116,255,0)_68%)] blur-2xl" />
                    <div className="absolute right-[8%] top-[80px] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.18),rgba(16,185,129,0)_72%)] blur-2xl" />
                    <div className="absolute left-[6%] top-[220px] h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.18),rgba(251,191,36,0)_70%)] blur-2xl" />
                </div>

                <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
                    <Link
                        href="/"
                        className="group inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/70 px-4 py-2 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                            <Bot className="h-5 w-5" />
                        </span>
                        <span className="space-y-0.5">
                            <span className="block text-sm font-semibold tracking-tight text-slate-900">
                                Bot Admin Pro
                            </span>
                            <span className="block text-xs text-slate-500">
                                IA para operacao comercial
                            </span>
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-6 text-sm text-slate-600 lg:flex">
                        <a href="#funcionalidades" className="transition-colors hover:text-slate-900">
                            Funcionalidades
                        </a>
                        <a href="#como-funciona" className="transition-colors hover:text-slate-900">
                            Como funciona
                        </a>
                        <a href="#planos" className="transition-colors hover:text-slate-900">
                            Planos
                        </a>
                    </nav>

                    <div className="flex items-center gap-2">
                        <Button asChild variant="outline" className="hidden sm:inline-flex">
                            <Link href={panelHref}>Acessar painel</Link>
                        </Button>
                        <Button
                            asChild
                            className="rounded-full px-5 shadow-lg shadow-primary/20"
                        >
                            <Link href="/register">Criar cadastro</Link>
                        </Button>
                    </div>
                </header>

                <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1.03fr)_minmax(420px,0.97fr)] lg:items-center lg:px-8 lg:pb-24 lg:pt-10">
                    <div className="space-y-7">
                        <div className="space-y-4">
                            <Badge className="rounded-full border border-primary/10 bg-primary/10 px-3 py-1 text-primary">
                                Atendimento, pedidos e checkout em um unico sistema
                            </Badge>
                            <h1 className="max-w-4xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                                Sua operacao comercial com{" "}
                                <span className="bg-[linear-gradient(120deg,#0f172a_0%,#2563eb_35%,#0ea5e9_70%,#0f766e_100%)] bg-clip-text text-transparent">
                                    IA vendendo no WhatsApp
                                </span>
                                , organizando o painel e acelerando o time.
                            </h1>
                            <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                                O Bot Admin Pro conecta atendimento, catalogo,
                                clientes, pedidos, pagamentos, horarios,
                                handover e billing em uma experiencia unica para
                                lojistas e operacoes SaaS.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button
                                asChild
                                size="lg"
                                className="rounded-full px-6 text-sm font-semibold shadow-xl shadow-primary/25"
                            >
                                <Link href="/register">
                                    Criar cadastro
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Button
                                asChild
                                size="lg"
                                variant="outline"
                                className="rounded-full border-slate-300 bg-white/80 px-6 text-sm font-semibold backdrop-blur"
                            >
                                <Link href={panelHref}>Acessar painel</Link>
                            </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {trustPoints.map((point, index) => (
                                <div
                                    key={point}
                                    className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur duration-500"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    <p className="text-sm font-medium leading-6 text-slate-700">
                                        {point}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute -left-8 top-10 hidden h-20 w-20 rounded-full bg-sky-200/50 blur-2xl lg:block" />
                        <div className="absolute -right-8 bottom-10 hidden h-24 w-24 rounded-full bg-emerald-200/50 blur-2xl lg:block" />
                        <div className="relative rounded-[32px] border border-white/70 bg-white/85 p-4 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
                            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                <Card className="border-slate-200/80 bg-slate-50/80 shadow-sm">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-1">
                                                <CardTitle className="text-base">
                                                    Atendimento em andamento
                                                </CardTitle>
                                                <CardDescription>
                                                    IA conduzindo o pedido em tempo real
                                                </CardDescription>
                                            </div>
                                            <Badge className="bg-emerald-100 text-emerald-700">
                                                Operacao online
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="flex justify-end">
                                            <div className="max-w-[85%] rounded-3xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-white shadow-lg shadow-primary/15">
                                                Quero 2 coca, 1 espeto e entrega na Rua X, 123.
                                            </div>
                                        </div>
                                        <div className="flex justify-start">
                                            <div className="max-w-[88%] rounded-3xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
                                                Perfeito! Adicionei os itens ao
                                                carrinho, confirmei o endereco e
                                                ja posso seguir com checkout por
                                                Pix online ou pagamento na entrega.
                                            </div>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-3">
                                            {[
                                                {
                                                    icon: ShoppingCart,
                                                    label: "Carrinho",
                                                    value: "Itens + taxas",
                                                },
                                                {
                                                    icon: Truck,
                                                    label: "Entrega",
                                                    value: "Delivery ou retirada",
                                                },
                                                {
                                                    icon: WalletCards,
                                                    label: "Pagamento",
                                                    value: "Pix, cartao ou dinheiro",
                                                },
                                            ].map((item) => (
                                                <div
                                                    key={item.label}
                                                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                                                >
                                                    <item.icon className="h-4 w-4 text-primary" />
                                                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                        {item.label}
                                                    </p>
                                                    <p className="mt-1 text-sm font-medium text-slate-800">
                                                        {item.value}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="grid gap-4">
                                    <Card className="border-slate-200/80 bg-[linear-gradient(160deg,#0f172a,#1e293b)] text-white shadow-sm">
                                        <CardHeader className="pb-3">
                                            <Badge className="w-fit bg-white/10 text-slate-100">
                                                Setup inteligente
                                            </Badge>
                                            <CardTitle className="text-lg">
                                                Loja configurada antes do QR
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3 text-sm leading-6 text-slate-200">
                                            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                                                <span>Perfil do negocio</span>
                                                <span className="font-medium text-white">
                                                    Mercearia
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                                                <span>Checkout</span>
                                                <span className="font-medium text-white">
                                                    Pix + entrega
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                                                <span>Status</span>
                                                <span className="inline-flex items-center gap-2 font-medium text-emerald-300">
                                                    <QrCode className="h-4 w-4" />
                                                    Pronto para conectar
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-slate-200/80 bg-white shadow-sm">
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-base">
                                                O que o lojista controla
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid gap-2">
                                            {[
                                                "Horario de atendimento e ausencia",
                                                "Taxa de entrega e retirada no local",
                                                "Produtos, tags, imagens e promocoes",
                                                "Clientes, pedidos e handovers",
                                            ].map((item) => (
                                                <div
                                                    key={item}
                                                    className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                                                >
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                                    <span className="text-sm text-slate-700">
                                                        {item}
                                                    </span>
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
                <div className="grid gap-4 rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur lg:grid-cols-4">
                    {[
                        {
                            value: "1 painel",
                            label: "Produtos, clientes, pedidos, mensagens e billing reunidos",
                        },
                        {
                            value: "WhatsApp + Telegram",
                            label: "Canais e automacoes operando na mesma estrutura",
                        },
                        {
                            value: "Pix + entrega",
                            label: "Checkout preparado para pagamento online e no local",
                        },
                        {
                            value: "IA com contexto",
                            label: "Catalogo, tags, historico e regras de negocio alimentando o atendimento",
                        },
                    ].map((item, index) => (
                        <div
                            key={item.value}
                            className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 duration-500"
                            style={{ animationDelay: `${120 + index * 100}ms` }}
                        >
                            <p className="text-lg font-bold text-slate-950">
                                {item.value}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {item.label}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <section
                id="funcionalidades"
                className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8"
            >
                <div className="max-w-3xl space-y-3">
                    <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                        Funcionalidades reais do sistema
                    </Badge>
                    <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                        Tudo o que a operacao precisa para atender, vender e organizar o backstage
                    </h2>
                    <p className="text-base leading-8 text-slate-600">
                        A plataforma foi pensada para o dia a dia do lojista e
                        tambem para quem opera SaaS com tenants, assinaturas,
                        conectores, billing e administracao.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {capabilityCards.map((item, index) => (
                        <Card
                            key={item.title}
                            className="animate-in fade-in slide-in-from-bottom-3 border-none bg-white shadow-sm duration-500"
                            style={{ animationDelay: `${index * 80}ms` }}
                        >
                            <CardHeader className="space-y-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.14),rgba(14,165,233,0.14))] text-primary">
                                    <item.icon className="h-6 w-6" />
                                </div>
                                <div className="space-y-2">
                                    <CardTitle className="text-lg">
                                        {item.title}
                                    </CardTitle>
                                    <CardDescription className="text-sm leading-7 text-slate-600">
                                        {item.description}
                                    </CardDescription>
                                </div>
                            </CardHeader>
                        </Card>
                    ))}
                </div>
            </section>

            <section
                id="como-funciona"
                className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
            >
                <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
                    <div className="space-y-4">
                        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                            Fluxo operacional
                        </Badge>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                            Da configuracao ao pedido finalizado, sem trocar de sistema
                        </h2>
                        <p className="text-base leading-8 text-slate-600">
                            O produto foi desenhado para que o lojista consiga
                            sair do setup inicial, conectar o numero e operar o
                            atendimento em poucos passos.
                        </p>

                        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                            {nicheCards.map((item) => (
                                <div
                                    key={item.title}
                                    className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                                >
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-primary">
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <p className="mt-4 text-lg font-semibold text-slate-900">
                                        {item.title}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-slate-600">
                                        {item.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute left-6 top-6 hidden h-[calc(100%-3rem)] w-px bg-gradient-to-b from-primary/40 via-sky-200 to-transparent lg:block" />
                        <div className="space-y-4">
                            {operationSteps.map((item, index) => (
                                <div
                                    key={item.step}
                                    className="animate-in fade-in slide-in-from-right-4 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-sm duration-500"
                                    style={{ animationDelay: `${index * 100}ms` }}
                                >
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a,#2563eb)] text-sm font-bold text-white shadow-lg shadow-primary/15">
                                            {item.step}
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-xl font-semibold text-slate-900">
                                                {item.title}
                                            </h3>
                                            <p className="text-sm leading-7 text-slate-600">
                                                {item.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section
                id="planos"
                className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8"
            >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl space-y-3">
                        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                            Planos de assinatura
                        </Badge>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                            Escolha o ritmo ideal para a sua operacao crescer
                        </h2>
                        <p className="text-base leading-8 text-slate-600">
                            Os planos abaixo sao os mesmos usados no fluxo de
                            billing do sistema. Comece leve, valide o processo
                            e suba de nivel quando a operacao pedir.
                        </p>
                    </div>

                    <Button asChild variant="outline" className="rounded-full bg-white">
                        <Link href={primaryPlanCtaHref}>Ver planos no sistema</Link>
                    </Button>
                </div>

                <div className="grid gap-4 xl:grid-cols-4">
                    {plans.map((plan) => {
                        const isFeatured = plan.planType === "PRO";

                        return (
                            <Card
                                key={plan.planType}
                                className={`relative overflow-hidden border-none shadow-sm ${
                                    isFeatured
                                        ? "bg-[linear-gradient(180deg,#0f172a_0%,#1e293b_100%)] text-white shadow-2xl shadow-slate-300/50"
                                        : "bg-white"
                                }`}
                            >
                                {isFeatured ? (
                                    <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
                                        <Crown className="h-3.5 w-3.5" />
                                        Mais escolhido
                                    </div>
                                ) : null}
                                <CardHeader className="space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-2">
                                            <CardTitle
                                                className={`text-2xl ${
                                                    isFeatured ? "text-white" : "text-slate-950"
                                                }`}
                                            >
                                                {plan.name}
                                            </CardTitle>
                                            <CardDescription
                                                className={`leading-7 ${
                                                    isFeatured
                                                        ? "text-slate-300"
                                                        : "text-slate-600"
                                                }`}
                                            >
                                                {plan.description}
                                            </CardDescription>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <p
                                            className={`text-4xl font-black tracking-tight ${
                                                isFeatured ? "text-white" : "text-slate-950"
                                            }`}
                                        >
                                            {plan.priceCents === 0
                                                ? "Gratis"
                                                : formatMoney(plan.priceCents)}
                                        </p>
                                        <p
                                            className={`text-sm ${
                                                isFeatured
                                                    ? "text-slate-300"
                                                    : "text-slate-500"
                                            }`}
                                        >
                                            {plan.priceCents === 0
                                                ? "Entrada inicial para validar o produto"
                                                : `Cobranca a cada ${plan.cycleDays} dias`}
                                        </p>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <div
                                        className={`rounded-2xl border px-4 py-3 ${
                                            isFeatured
                                                ? "border-white/10 bg-white/5"
                                                : "border-slate-200 bg-slate-50"
                                        }`}
                                    >
                                        <p
                                            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                                                isFeatured
                                                    ? "text-slate-300"
                                                    : "text-slate-400"
                                            }`}
                                        >
                                            Consumo de IA
                                        </p>
                                        <p
                                            className={`mt-2 text-sm font-medium ${
                                                isFeatured
                                                    ? "text-white"
                                                    : "text-slate-900"
                                            }`}
                                        >
                                            {plan.messageLimitPerDay === null
                                                ? "Uso diario sem limite configurado"
                                                : `${plan.messageLimitPerDay} mensagens por dia`}
                                        </p>
                                    </div>

                                    <ul className="space-y-3">
                                        {plan.features.map((feature) => (
                                            <li
                                                key={feature}
                                                className={`flex items-start gap-2 text-sm leading-6 ${
                                                    isFeatured
                                                        ? "text-slate-200"
                                                        : "text-slate-600"
                                                }`}
                                            >
                                                <CheckCircle2
                                                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                                                        isFeatured
                                                            ? "text-emerald-300"
                                                            : "text-emerald-500"
                                                    }`}
                                                />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <Button
                                        asChild
                                        className={`w-full rounded-full ${
                                            isFeatured
                                                ? "bg-white text-slate-950 hover:bg-white/90"
                                                : ""
                                        }`}
                                        variant={isFeatured ? "secondary" : "default"}
                                    >
                                        <Link href={primaryPlanCtaHref}>
                                            {plan.ctaLabel}
                                        </Link>
                                    </Button>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
                <div className="relative overflow-hidden rounded-[36px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_45%,#0f766e_100%)] px-6 py-8 text-white shadow-2xl shadow-slate-200/70 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
                    <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                    <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />

                    <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="space-y-4">
                            <Badge className="w-fit bg-white/10 text-slate-100">
                                Sistema pronto para vender e organizar
                            </Badge>
                            <h2 className="max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
                                Coloque sua operacao para atender com mais consistencia, menos improviso e muito mais contexto.
                            </h2>
                            <p className="max-w-2xl text-base leading-8 text-slate-100/85">
                                Se o objetivo e transformar atendimento em
                                processo comercial, o Bot Admin Pro ja entrega a
                                base para conectar canais, vender, organizar o
                                time e escalar o SaaS com mais clareza.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                            <Button
                                asChild
                                size="lg"
                                className="rounded-full bg-white px-6 text-slate-950 hover:bg-white/90"
                            >
                                <Link href="/register">Criar cadastro</Link>
                            </Button>
                            <Button
                                asChild
                                size="lg"
                                variant="outline"
                                className="rounded-full border-white/30 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"
                            >
                                <Link href={panelHref}>Acessar painel</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
