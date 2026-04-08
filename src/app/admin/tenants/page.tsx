import {
    getEffectiveAiMessageLimitPerDay,
    normalizeAiMessageLimitOverride,
} from "@/lib/saas/access";
import { listSaasUsers } from "@/lib/saas/server";
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
import { PlanType, SubscriptionStatus } from "@prisma/client";
import Link from "next/link";
import { Users } from "lucide-react";
import { updateTenantAccessAction, updateTenantAiLimitAction } from "./actions";

type SearchParams = Promise<{
    accessStatus?: string;
    subscriptionStatus?: string;
}>;

function formatDate(value?: Date | null) {
    if (!value) {
        return "n/a";
    }

    return value.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function formatAiLimit(value: number | null) {
    return value === null ? "Ilimitado" : `${value}/dia`;
}

export default async function AdminTenantsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const params = await searchParams;
    const users = await listSaasUsers(params);

    const statusHref = (status?: string, subscriptionStatus?: string) => {
        const query = new URLSearchParams();
        if (status) query.set("accessStatus", status);
        if (subscriptionStatus)
            query.set("subscriptionStatus", subscriptionStatus);
        const value = query.toString();
        return value ? `/admin/tenants?${value}` : "/admin/tenants";
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900">
                    <Users className="w-8 h-8 text-primary" />
                    Clientes SaaS
                </h1>
                <p className="text-slate-500">
                    Filtre assinatura, acompanhe o plano atual e altere o acesso
                    manualmente quando precisar.
                </p>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                    <Button asChild variant={!params.accessStatus ? "default" : "outline"}>
                        <Link href={statusHref(undefined, params.subscriptionStatus)}>
                            Todos
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={params.accessStatus === "ACTIVE" ? "default" : "outline"}
                    >
                        <Link href={statusHref("ACTIVE", params.subscriptionStatus)}>
                            Ativos
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={params.accessStatus === "BANNED" ? "default" : "outline"}
                    >
                        <Link href={statusHref("BANNED", params.subscriptionStatus)}>
                            Banidos
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={
                            params.subscriptionStatus === SubscriptionStatus.ACTIVE
                                ? "default"
                                : "outline"
                        }
                    >
                        <Link href={statusHref(params.accessStatus, SubscriptionStatus.ACTIVE)}>
                            Assinatura ativa
                        </Link>
                    </Button>
                    <Button
                        asChild
                        variant={
                            params.subscriptionStatus === SubscriptionStatus.PAST_DUE
                                ? "default"
                                : "outline"
                        }
                    >
                        <Link href={statusHref(params.accessStatus, SubscriptionStatus.PAST_DUE)}>
                            Grace period
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                            <TableRow className="hover:bg-transparent border-slate-100">
                                <TableHead>Cliente</TableHead>
                                <TableHead>Plano</TableHead>
                                <TableHead>IA por dia</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Bots</TableHead>
                                <TableHead>Expira em</TableHead>
                                <TableHead className="text-right">Acoes</TableHead>
                            </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    <div className="font-semibold text-slate-900">
                                        {user.name || "Sem nome"}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {user.email || "Sem e-mail"}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary">
                                        {user.subscription?.planType || "SEM PLANO"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <div className="font-semibold text-slate-900">
                                            {formatAiLimit(
                                                getEffectiveAiMessageLimitPerDay({
                                                    planType:
                                                        user.subscription
                                                            ?.planType ??
                                                        PlanType.FREE,
                                                    aiMessageLimitOverride:
                                                        user.aiMessageLimitOverride,
                                                }),
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {normalizeAiMessageLimitOverride(
                                                user.aiMessageLimitOverride,
                                            ) === null
                                                ? "Limite padrao do plano"
                                                : "Override manual ativo"}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell className="space-x-2">
                                    <Badge
                                        variant="outline"
                                        className={
                                            user.accessStatus === "ACTIVE"
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                : "border-red-200 bg-red-50 text-red-700"
                                        }
                                    >
                                        {user.accessStatus}
                                    </Badge>
                                    {user.subscription?.status && (
                                        <Badge variant="outline">
                                            {user.subscription.status}
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell>{user._count.bots}</TableCell>
                                <TableCell>
                                    {formatDate(user.subscription?.endDate)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex flex-col items-end gap-3">
                                        <form
                                            action={updateTenantAccessAction}
                                            className="inline-flex gap-2"
                                        >
                                            <input
                                                type="hidden"
                                                name="userId"
                                                value={user.id}
                                            />
                                            {user.accessStatus === "ACTIVE" ? (
                                                <>
                                                    <input
                                                        type="hidden"
                                                        name="accessStatus"
                                                        value="BANNED"
                                                    />
                                                    <Button
                                                        type="submit"
                                                        variant="outline"
                                                        size="sm"
                                                    >
                                                        Banir
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <input
                                                        type="hidden"
                                                        name="accessStatus"
                                                        value="ACTIVE"
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                    >
                                                        Ativar
                                                    </Button>
                                                </>
                                            )}
                                        </form>

                                        <form
                                            action={updateTenantAiLimitAction}
                                            className="flex items-center gap-2"
                                        >
                                            <input
                                                type="hidden"
                                                name="userId"
                                                value={user.id}
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                name="aiMessageLimitOverride"
                                                defaultValue={
                                                    user.aiMessageLimitOverride ??
                                                    ""
                                                }
                                                placeholder="200"
                                                className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-xs"
                                            />
                                            <Button
                                                type="submit"
                                                size="sm"
                                                variant="secondary"
                                            >
                                                Salvar IA
                                            </Button>
                                        </form>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {users.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={7}
                                    className="h-32 text-center text-slate-400 italic"
                                >
                                    Nenhum cliente encontrado para este filtro.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
