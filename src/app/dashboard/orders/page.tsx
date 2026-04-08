import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowRight, Bike, RadioTower, Store } from "lucide-react";
import OrderCardsDashboard from "@/components/dashboard/order-cards-dashboard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { getDeliveryOrderDashboard } from "@/lib/orders-dashboard";
import type { DeliveryOrderCard } from "@/lib/orders-dashboard.types";
import { requireSessionUser } from "@/lib/server-session";

export const runtime = "nodejs";

export default async function DashboardOrdersPage() {
    const user = await requireSessionUser();

    if (user.isSuperAdmin) {
        redirect("/admin/dashboard");
    }

    let orders: DeliveryOrderCard[] = [];
    let loadError: string | null = null;

    try {
        orders = await getDeliveryOrderDashboard(user.id);
    } catch (error) {
        loadError =
            error instanceof Error
                ? error.message
                : "Nao foi possivel carregar os pedidos agora.";
    }

    return (
        <div className="mx-auto max-w-7xl space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                    <Badge
                        variant="outline"
                        className="w-fit border-sky-200 bg-sky-50 text-sky-700"
                    >
                        Delivery em tempo real
                    </Badge>
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                            Pedidos do seu delivery
                        </h1>
                        <p className="max-w-2xl text-slate-500">
                            Os pedidos confirmados no WhatsApp aparecem aqui em
                            cards, com atualizacao ao vivo e atalho para avisar
                            o cliente quando o motoboy sair.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline">
                        <Link href="/dashboard">
                            Voltar ao painel
                        </Link>
                    </Button>
                    <Button asChild>
                        <Link href="/dashboard/products">
                            Ajustar catalogo
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>

            {loadError && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Pedidos indisponiveis no momento</AlertTitle>
                    <AlertDescription>
                        {loadError}. Se voce acabou de subir o back-end, reinicie
                        o `telegram-user-service-nest` para carregar as rotas
                        novas.
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-none bg-white shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Store className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Operacao da loja
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        Cada card traz itens, endereco e valor total para o seu
                        time despachar com agilidade.
                    </CardContent>
                </Card>

                <Card className="border-none bg-white shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <RadioTower className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Atualizacao ao vivo
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        O painel escuta o Socket.io do Nest e mostra os seus
                        pedidos finalizados sem recarregar a pagina.
                    </CardContent>
                </Card>

                <Card className="border-none bg-white shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Bike className="h-5 w-5 text-primary" />
                            <CardTitle className="text-lg">
                                Saida para entrega
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-500">
                        Um clique muda o status e dispara a mensagem no
                        WhatsApp: &quot;Seu pedido saiu para entrega com o
                        motoboy!&quot;.
                    </CardContent>
                </Card>
            </div>

            <OrderCardsDashboard initialOrders={orders} userId={user.id} />
        </div>
    );
}
