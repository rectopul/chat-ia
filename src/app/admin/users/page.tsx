import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";
import {
    Users,
    Search,
    Calendar,
    CheckCircle2,
    XCircle,
    Clock,
    Filter,
    MoreVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { UserActionsMenu } from "./user-actions-menu";

export default async function AdminUsersPage({
    searchParams,
}: {
    searchParams: Promise<{ filter?: string }>;
}) {
    const filter = (await searchParams).filter;
    let dateLimit: Date | null = null;

    if (filter === "no_purchase_3d") dateLimit = subDays(new Date(), 3);
    if (filter === "no_purchase_7d") dateLimit = subDays(new Date(), 7);
    if (filter === "no_purchase_30d") dateLimit = subDays(new Date(), 30);
    if (filter === "no_purchase_60d") dateLimit = subDays(new Date(), 60);

    let users;
    if (dateLimit) {
        users = await prisma.telegramUser.findMany({
            where: {
                sales: {
                    none: {
                        status: "PAID",
                        paidAt: {
                            gte: dateLimit,
                        },
                    },
                },
            },
            orderBy: { lastSeenAt: "desc" },
        });
    } else {
        users = await prisma.telegramUser.findMany({
            orderBy: { lastSeenAt: "desc" },
        });
    }

    const filters = [
        { label: "Todos", value: null },
        { label: "3 dias", value: "no_purchase_3d" },
        { label: "1 semana", value: "no_purchase_7d" },
        { label: "1 mês", value: "no_purchase_30d" },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                        <Users className="w-8 h-8 text-primary" />
                        Usuários do Bot
                    </h1>
                    <p className="text-slate-500">
                        Acompanhe e gerencie todos os usuários que interagiram
                        com seus bots.
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
                    <div className="flex items-center px-3 py-1.5 text-xs font-semibold text-slate-500 border-r border-slate-100 shrink-0">
                        <Filter className="w-3.5 h-3.5 mr-2" />
                        SEM COMPRA:
                    </div>
                    {filters.map((f) => (
                        <Link
                            key={f.value}
                            href={
                                f.value
                                    ? `/admin/users?filter=${f.value}`
                                    : "/admin/users"
                            }
                        >
                            <Button
                                variant={
                                    filter === f.value || (!filter && !f.value)
                                        ? "default"
                                        : "ghost"
                                }
                                size="sm"
                                className="h-8 text-xs font-medium"
                            >
                                {f.label}
                            </Button>
                        </Link>
                    ))}
                </div>
            </div>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-slate-100">
                            <TableHead className="font-bold text-slate-700">
                                ID / Nome
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Telegram
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Última Atividade
                            </TableHead>
                            <TableHead className="font-bold text-slate-700 text-center">
                                Assinante
                            </TableHead>
                            <TableHead className="text-right font-bold text-slate-700"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow
                                key={user.id}
                                className="border-slate-50 hover:bg-slate-50/30 transition-colors"
                            >
                                <TableCell className="py-4">
                                    <div className="font-bold text-slate-900">
                                        {user.firstName} {user.lastName}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {user.id}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-slate-700 font-medium">
                                        @{user.username || "n/a"}
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono">
                                        {user.telegramUserId}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        <span className="text-sm">
                                            {user.lastSeenAt.toLocaleString(
                                                "pt-BR",
                                                {
                                                    day: "2-digit",
                                                    month: "2-digit",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                },
                                            )}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-center">
                                    {user.isSubscriber ? (
                                        <Badge
                                            variant="default"
                                            className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 shadow-none"
                                        >
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            Sim
                                        </Badge>
                                    ) : (
                                        <Badge
                                            variant="outline"
                                            className="text-slate-400 border-slate-200 hover:bg-transparent"
                                        >
                                            Não
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <UserActionsMenu
                                        userId={user.id}
                                        userName={`${user.firstName} ${user.lastName}`}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                        {users.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-32 text-center text-slate-400 italic"
                                >
                                    Nenhum usuário encontrado com este filtro.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
