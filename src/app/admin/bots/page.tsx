import { prisma } from "@/lib/prisma";
import { BotConnectionManager } from "@/components/BotConnectionManager";
import { BotTokenEditor } from "@/components/BotTokenEditor";
import {
    Bot,
    Plus,
    Info,
    Phone,
    Hash,
    ShieldCheck,
    Power,
    PowerOff,
    Trash,
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    createAdminBotAction,
    deleteAdminBotAction,
    saveAdminBotTokenAction,
    toggleAdminBotAction,
} from "./actions";

type SearchParams = Promise<{
    error?: string;
    success?: string;
    phoneNumber?: string;
}>;

export default async function AdminBotsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const params = await searchParams;
    const [bots, customers] = await Promise.all([
        prisma.botAccount.findMany({
            include: {
                ownerUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        }),
        prisma.user.findMany({
            where: { role: "CUSTOMER" },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                name: true,
                email: true,
            },
        }),
    ]);

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    Contas e Bots
                </h1>
                <p className="text-slate-500">
                    Gerencie suas conexões MTProto e bots auxiliares de
                    business.
                </p>
            </div>

            {params.error === "phone_number_unavailable" && (
                <Alert variant="destructive">
                    <AlertTitle>Numero indisponivel</AlertTitle>
                    <AlertDescription>
                        O numero {params.phoneNumber || "informado"} ja esta em
                        uso por outra conta cadastrada.
                    </AlertDescription>
                </Alert>
            )}

            {params.success === "bot_created" && (
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
                    <AlertTitle>Conta criada</AlertTitle>
                    <AlertDescription>
                        A nova instancia {params.phoneNumber || "do Telegram"} foi
                        salva com sucesso.
                    </AlertDescription>
                </Alert>
            )}

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-primary" />
                        <CardTitle>Nova Instância</CardTitle>
                    </div>
                    <CardDescription>
                        Cadastre uma nova conta do Telegram para disparos em
                        massa e automações.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        action={createAdminBotAction}
                        className="grid grid-cols-1 md:grid-cols-5 gap-6"
                    >
                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Nome
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Um nome interno para identificar esta
                                        conta.
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="name"
                                placeholder="Ex: Principal"
                                required
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Telefone
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Número com código do país. Ex: +5511...
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="phoneNumber"
                                placeholder="+55..."
                                required
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                API ID
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Obtido em my.telegram.org
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="apiId"
                                type="number"
                                placeholder="123456"
                                required
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                API Hash
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Obtido em my.telegram.org
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="apiHash"
                                placeholder="abc123..."
                                required
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">
                                Dono do Tenant
                            </label>
                            <select
                                name="ownerUserId"
                                className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Sem dono definido</option>
                                {customers.map((customer) => (
                                    <option key={customer.id} value={customer.id}>
                                        {customer.name ||
                                            customer.email ||
                                            customer.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <Button
                            type="submit"
                            className="md:col-span-5 w-full bg-primary hover:bg-primary/90"
                        >
                            Criar Conta
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-slate-100">
                            <TableHead className="w-[250px] font-bold text-slate-700">
                                Identificação
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                <div className="flex items-center gap-2">
                                    Business Bot Token
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="w-3.5 h-3.5 text-slate-400" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Token do BotFather para integração
                                            Business.
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                MTProto
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Tenant
                            </TableHead>
                            <TableHead className="text-right font-bold text-slate-700">
                                Ações
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {bots.map((bot) => (
                            <TableRow
                                key={bot.id}
                                className="border-slate-50 hover:bg-slate-50/30 transition-colors"
                            >
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`p-2 rounded-full ${bot.isActive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}
                                        >
                                            <Bot className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">
                                                {bot.name}
                                            </div>
                                            <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                                                <Phone className="w-3 h-3" />
                                                {bot.phoneNumber}
                                            </div>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <BotTokenEditor
                                        botId={bot.id}
                                        currentToken={
                                            bot.businessBotToken ?? ""
                                        }
                                        onSave={saveAdminBotTokenAction}
                                    />
                                </TableCell>
                                <TableCell>
                                    <BotConnectionManager bot={bot} />
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm font-medium text-slate-700">
                                        {bot.ownerUser?.name ||
                                            bot.ownerUser?.email ||
                                            "Sem dono"}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right flex items-center gap-2 justify-end">
                                    <form
                                        action={toggleAdminBotAction.bind(
                                            null,
                                            bot.id,
                                            bot.isActive,
                                        )}
                                    >
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={
                                                bot.isActive
                                                    ? "text-red-500 hover:text-red-600 hover:bg-red-50"
                                                    : "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                                            }
                                        >
                                            {bot.isActive ? (
                                                <>
                                                    <PowerOff className="w-4 h-4 mr-2" />
                                                    Desativar
                                                </>
                                            ) : (
                                                <>
                                                    <Power className="w-4 h-4 mr-2" />
                                                    Ativar
                                                </>
                                            )}
                                        </Button>
                                    </form>

                                    <form action={deleteAdminBotAction.bind(null, bot.id)}>
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            className="text-destructive hover:bg-destructive/10"
                                            type="submit"
                                        >
                                            <Trash className="size-3.5" />
                                        </Button>
                                    </form>
                                </TableCell>
                            </TableRow>
                        ))}
                        {bots.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-24 text-center text-slate-400 italic"
                                >
                                    Nenhuma conta cadastrada.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
