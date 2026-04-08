import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import QRConnection from "@/components/dashboard/qr-connection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle, PlugZap, Trash2, Waves } from "lucide-react";
import { deleteWhatsappInstanceAction } from "./actions";

function statusTone(status: string) {
    const normalized = status.toUpperCase();

    if (normalized === "CONNECTED") {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (normalized === "CONNECTING") {
        return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-slate-200 bg-slate-100 text-slate-700";
}

export default async function DashboardWhatsappPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (session.user.isSuperAdmin) {
        redirect("/admin/dashboard");
    }

    const instances = await prisma.whatsappInstance.findMany({
        where: { userId: session.user.id },
        include: {
            _count: {
                select: {
                    orders: true,
                    handovers: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    const connectedCount = instances.filter(
        (instance) => instance.status.toUpperCase() === "CONNECTED",
    ).length;
    const disconnectedCount = instances.length - connectedCount;
    const totalHandovers = instances.reduce(
        (sum, instance) => sum + instance._count.handovers,
        0,
    );
    const managedInstanceName = `user_${session.user.id}`;
    const primaryInstance =
        instances.find(
            (instance) => instance.instanceName === managedInstanceName,
        ) ??
        instances[0] ??
        null;

    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900">
                    <MessageCircle className="w-8 h-8 text-primary" />
                    Instancias de WhatsApp
                </h2>
                <p className="max-w-3xl text-slate-500">
                    Cada cliente gerencia aqui as proprias instancias. A
                    configuracao tecnica do webhook fica automatica no back-end,
                    entao a loja so precisa conectar o WhatsApp e acompanhar o
                    status.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Instancias conectadas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {connectedCount}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Instancias pendentes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {disconnectedCount}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Handovers registrados
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {totalHandovers}
                    </CardContent>
                </Card>
            </div>

            <QRConnection initialStatus={primaryInstance?.status ?? null} />

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle>Conexao automatica</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800">
                        O sistema gera e gerencia automaticamente a instancia
                        principal do cliente no formato tecnico
                        <strong className="mx-1">{managedInstanceName}</strong>.
                        Para conectar, use o QR Code acima.
                    </div>
                </CardContent>
            </Card>

            {instances.length === 0 ? (
                <Card className="border-none shadow-sm">
                    <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                        <div className="rounded-full bg-slate-100 p-4 text-slate-500">
                            <Waves className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-lg font-semibold text-slate-900">
                                Nenhuma instancia cadastrada
                            </p>
                            <p className="text-sm text-slate-500">
                                Cadastre a primeira instancia do WhatsApp para
                                preparar a operacao omnichannel do cliente.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {instances.map((instance) => (
                        <Card key={instance.id} className="border-none shadow-sm">
                            <CardHeader className="flex flex-row items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="flex items-center gap-2">
                                        <PlugZap className="h-5 w-5 text-primary" />
                                        {instance.instanceName}
                                    </CardTitle>
                                    <p className="text-sm text-slate-500">
                                        Webhook tecnico gerenciado
                                        automaticamente pelo sistema.
                                    </p>
                                </div>
                                <Badge
                                    variant="outline"
                                    className={statusTone(instance.status)}
                                >
                                    {instance.status}
                                </Badge>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                            Pedidos vinculados
                                        </p>
                                        <p className="mt-2 text-2xl font-bold text-slate-900">
                                            {instance._count.orders}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                            Handovers
                                        </p>
                                        <p className="mt-2 text-2xl font-bold text-slate-900">
                                            {instance._count.handovers}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                                    Nome tecnico da instancia:
                                    <strong className="ml-1 text-slate-900">
                                        {instance.instanceName}
                                    </strong>
                                </div>

                                <form action={deleteWhatsappInstanceAction}>
                                    <input
                                        type="hidden"
                                        name="id"
                                        value={instance.id}
                                    />
                                    <Button type="submit" variant="outline">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Remover instancia
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
