import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BotConnectionManager } from "@/components/BotConnectionManager";
import { BotTokenEditor } from "@/components/BotTokenEditor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
    Bot,
    CheckCircle2,
    CircleAlert,
    Phone,
    Plus,
    Power,
    PowerOff,
    Trash,
} from "lucide-react";
import {
    createUserBotAction,
    deleteUserBotAction,
    saveUserBotTokenAction,
    toggleUserBotAction,
} from "./actions";

type SearchParams = Promise<{
    error?: string;
    success?: string;
    phoneNumber?: string;
}>;

export default async function UserBotsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const params = await searchParams;
    const userId = session.user.id;
    const bots = await prisma.botAccount.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: "desc" },
    });

    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                    Minhas contas do Telegram
                </h2>
                <p className="text-slate-500">
                    Cadastre as contas do seu tenant e conecte o MTProto e o bot
                    business.
                </p>
            </div>

            {params.error === "phone_number_unavailable" && (
                <Alert variant="destructive">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Numero indisponivel</AlertTitle>
                    <AlertDescription>
                        O numero {params.phoneNumber || "informado"} ja esta em
                        uso por outra conta. Cadastre outro telefone para seguir.
                    </AlertDescription>
                </Alert>
            )}

            {params.error === "invalid_bot_form" && (
                <Alert variant="destructive">
                    <CircleAlert className="h-4 w-4" />
                    <AlertTitle>Dados invalidos</AlertTitle>
                    <AlertDescription>
                        Preencha nome, telefone, API ID e API Hash para criar a
                        conta.
                    </AlertDescription>
                </Alert>
            )}

            {params.success === "bot_created" && (
                <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Conta cadastrada</AlertTitle>
                    <AlertDescription>
                        A conta {params.phoneNumber || "do Telegram"} foi criada
                        e ja esta pronta para a conexao via MTProto.
                    </AlertDescription>
                </Alert>
            )}

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-primary" />
                        Nova conta
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        action={createUserBotAction}
                        className="grid grid-cols-1 gap-4 md:grid-cols-4"
                    >
                        <input
                            name="name"
                            placeholder="Nome da conta"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <input
                            name="phoneNumber"
                            placeholder="+55..."
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <input
                            name="apiId"
                            type="number"
                            placeholder="API ID"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <input
                            name="apiHash"
                            placeholder="API Hash"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <Button type="submit" className="md:col-span-4">
                            Criar conta
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead>Conta</TableHead>
                            <TableHead>Business Token</TableHead>
                            <TableHead>MTProto</TableHead>
                            <TableHead className="text-right">Acoes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {bots.map((bot) => (
                            <TableRow key={bot.id}>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`rounded-full p-2 ${bot.isActive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}
                                        >
                                            <Bot className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-slate-900">
                                                {bot.name}
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-slate-500">
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
                                        onSave={saveUserBotTokenAction}
                                    />
                                </TableCell>
                                <TableCell>
                                    <BotConnectionManager bot={bot} />
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="inline-flex gap-2">
                                        <form
                                            action={toggleUserBotAction.bind(
                                                null,
                                                bot.id,
                                                bot.isActive,
                                            )}
                                        >
                                            <Button variant="ghost" size="sm">
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
                                        <form
                                            action={deleteUserBotAction.bind(
                                                null,
                                                bot.id,
                                            )}
                                        >
                                            <Button variant="outline" size="sm">
                                                <Trash className="w-4 h-4 mr-2" />
                                                Excluir
                                            </Button>
                                        </form>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                        {bots.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={4}
                                    className="h-24 text-center text-slate-400 italic"
                                >
                                    Nenhuma conta do Telegram cadastrada ainda.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
