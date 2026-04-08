import { redirect } from "next/navigation";
import { MessageCircle, ShoppingBag, Store, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/server-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from "next/link";

export const runtime = "nodejs";

function formatMoney(valueCents: number) {
    return `R$ ${(valueCents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
    })}`;
}

function formatWhatsappId(value: string) {
    return value.replace(/@s\.whatsapp\.net$/i, "");
}

function formatDateTime(value: Date) {
    return value.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function truncateText(value: string | null, maxLength: number = 80) {
    if (!value) {
        return "Sem mensagem registrada ainda.";
    }

    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 1)}...`;
}

function getInstanceStatusClass(status: string | null | undefined) {
    const normalizedStatus = status?.toUpperCase();

    if (normalizedStatus === "CONNECTED") {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (normalizedStatus === "CONNECTING") {
        return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-slate-200 bg-slate-50 text-slate-600";
}

export default async function DashboardCustomersPage() {
    const user = await requireSessionUser();

    if (user.isSuperAdmin) {
        redirect("/admin/dashboard");
    }

    const [customers, orderAggregates] = await Promise.all([
        prisma.whatsappCustomer.findMany({
            where: {
                ownerUserId: user.id,
            },
            include: {
                whatsappInstance: {
                    select: {
                        id: true,
                        instanceName: true,
                        status: true,
                    },
                },
            },
            orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
        }),
        prisma.order.groupBy({
            by: ["customerWhatsappId"],
            where: {
                ownerUserId: user.id,
            },
            _count: {
                _all: true,
            },
            _sum: {
                totalCents: true,
            },
        }),
    ]);

    const orderMetricsByCustomer = new Map(
        orderAggregates.map((aggregate) => [
            aggregate.customerWhatsappId,
            {
                ordersCount: aggregate._count._all,
                totalRevenueCents: aggregate._sum.totalCents ?? 0,
            },
        ]),
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const customersWithOrders = customers.filter((customer) =>
        orderMetricsByCustomer.has(customer.whatsappId),
    ).length;
    const activeThisWeek = customers.filter(
        (customer) => customer.lastSeenAt >= sevenDaysAgo,
    ).length;
    const connectedInstances = new Set(
        customers
            .filter(
                (customer) =>
                    customer.whatsappInstance?.status?.toUpperCase() ===
                    "CONNECTED",
            )
            .map((customer) => customer.whatsappInstanceId)
            .filter(Boolean),
    ).size;

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                    <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900">
                        <Users className="h-8 w-8 text-primary" />
                        Clientes capturados
                    </h2>
                    <p className="max-w-3xl text-slate-500">
                        Esta lista mostra apenas os contatos atendidos pelo seu
                        tenant no WhatsApp. Cada assinante enxerga somente a
                        propria base de clientes.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline">
                        <Link href="/dashboard/whatsapp">Ver instancias</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/dashboard/orders">Abrir pedidos</Link>
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Total capturado
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {customers.length}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Ativos nos ultimos 7 dias
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {activeThisWeek}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Clientes com pedidos
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {customersWithOrders}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Instancias conectadas com carteira
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {connectedInstances}
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Origem automatica
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        Todo contato inbound do WhatsApp atualiza essa base
                        automaticamente com nome, ultima mensagem e data do
                        ultimo atendimento.
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <ShoppingBag className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Relacao com pedidos
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        Quando houver pedidos, o painel mostra quantidade e
                        receita acumulada por cliente para facilitar follow-up e
                        recompra.
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Store className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Isolamento por tenant
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        A consulta sempre filtra por seu usuario dono da loja.
                        Um assinante nao consegue acessar os clientes atendidos
                        por outro tenant.
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader>
                    <CardTitle>Base de clientes do WhatsApp</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-slate-50/50">
                            <TableRow className="border-slate-100 hover:bg-transparent">
                                <TableHead>Cliente</TableHead>
                                <TableHead>WhatsApp</TableHead>
                                <TableHead>Ultima mensagem</TableHead>
                                <TableHead>Ultimo contato</TableHead>
                                <TableHead>Pedidos</TableHead>
                                <TableHead>Receita</TableHead>
                                <TableHead>Instancia</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.length ? (
                                customers.map((customer) => {
                                    const metrics =
                                        orderMetricsByCustomer.get(
                                            customer.whatsappId,
                                        ) ?? {
                                            ordersCount: 0,
                                            totalRevenueCents: 0,
                                        };

                                    return (
                                        <TableRow key={customer.id}>
                                            <TableCell className="max-w-[220px]">
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-slate-900">
                                                        {customer.displayName ||
                                                            "Sem nome salvo"}
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        Primeiro contato em{" "}
                                                        {customer.firstSeenAt.toLocaleDateString(
                                                            "pt-BR",
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-medium text-slate-700">
                                                    {formatWhatsappId(
                                                        customer.whatsappId,
                                                    )}
                                                </span>
                                            </TableCell>
                                            <TableCell className="max-w-[320px] whitespace-normal text-sm text-slate-500">
                                                {truncateText(
                                                    customer.lastMessageText,
                                                )}
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600">
                                                {formatDateTime(
                                                    customer.lastSeenAt,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {metrics.ordersCount} pedido
                                                    {metrics.ordersCount === 1
                                                        ? ""
                                                        : "s"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="font-medium text-slate-700">
                                                {formatMoney(
                                                    metrics.totalRevenueCents,
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-slate-700">
                                                        {customer.whatsappInstance
                                                            ?.instanceName ||
                                                            "Sem instancia"}
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className={getInstanceStatusClass(
                                                            customer
                                                                .whatsappInstance
                                                                ?.status,
                                                        )}
                                                    >
                                                        {customer.whatsappInstance
                                                            ?.status ||
                                                            "DESVINCULADA"}
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="h-32 text-center text-slate-400 italic"
                                    >
                                        Nenhum cliente capturado ainda. Assim
                                        que uma conversa chegar pelo WhatsApp,
                                        ela aparecera aqui.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
