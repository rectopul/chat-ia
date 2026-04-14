"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import {
    Bike,
    CheckCircle2,
    Loader2,
    MapPin,
    Package2,
    Radio,
    Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { getPublicNestApiBaseUrl } from "@/lib/nest-api";
import { cn } from "@/lib/utils";
import {
    ORDER_FINALIZED_EVENT,
    ORDER_UPDATED_EVENT,
} from "@/lib/orders-dashboard.types";
import type { DeliveryOrderCard } from "@/lib/orders-dashboard.types";

type OrderCardsDashboardProps = {
    initialOrders: DeliveryOrderCard[];
    userId: string;
};

function formatMoney(valueCents: number, currency = "BRL") {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency,
    }).format(valueCents / 100);
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(new Date(value));
}

function getStatusCopy(status: DeliveryOrderCard["status"]) {
    switch (status) {
        case "PREPARING":
            return {
                label: "Em preparo",
                className: "border-amber-200 bg-amber-50 text-amber-700",
            };
        case "SHIPPED":
            return {
                label: "Saiu para entrega",
                className: "border-sky-200 bg-sky-50 text-sky-700",
            };
        case "DELIVERED":
            return {
                label: "Entregue",
                className:
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
            };
        default:
            return {
                label: "Pendente",
                className: "border-slate-200 bg-slate-100 text-slate-700",
            };
    }
}

function sortOrders(orders: DeliveryOrderCard[]) {
    return [...orders].sort((left, right) => {
        const leftPriority = left.status === "PREPARING" ? 0 : 1;
        const rightPriority = right.status === "PREPARING" ? 0 : 1;

        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }

        return (
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime()
        );
    });
}

export default function OrderCardsDashboard({
    initialOrders,
    userId,
}: OrderCardsDashboardProps) {
    const [orders, setOrders] = useState(() => sortOrders(initialOrders));
    const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
    const [isSocketConnected, setIsSocketConnected] = useState(false);

    useEffect(() => {
        const baseUrl = getPublicNestApiBaseUrl();

        if (!baseUrl || !userId) {
            return;
        }

        const socket: Socket = io(`${baseUrl}/orders`, {
            transports: ["websocket", "polling"],
            withCredentials: true,
            auth: {
                userId,
            },
        });

        const handleConnect = () => setIsSocketConnected(true);
        const handleDisconnect = () => setIsSocketConnected(false);
        const handleOrderEvent = (incomingOrder: DeliveryOrderCard) => {
            setOrders((currentOrders) => {
                const remainingOrders = currentOrders.filter(
                    (order) => order.id !== incomingOrder.id,
                );

                return sortOrders([incomingOrder, ...remainingOrders]);
            });
        };

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on(ORDER_FINALIZED_EVENT, handleOrderEvent);
        socket.on(ORDER_UPDATED_EVENT, handleOrderEvent);

        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off(ORDER_FINALIZED_EVENT, handleOrderEvent);
            socket.off(ORDER_UPDATED_EVENT, handleOrderEvent);
            socket.disconnect();
        };
    }, [userId]);

    const preparingCount = orders.filter(
        (order) => order.status === "PREPARING",
    ).length;
    const shippedCount = orders.filter(
        (order) => order.status === "SHIPPED",
    ).length;

    async function handleSendToDelivery(orderId: string) {
        try {
            setShippingOrderId(orderId);

            const response = await fetch(
                `/api/dashboard/orders/${orderId}/send-to-delivery`,
                {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                    },
                },
            );

            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(
                    payload?.message ||
                        payload?.error ||
                        "Nao foi possivel enviar o pedido para entrega.",
                );
            }

            const updatedOrder = payload as DeliveryOrderCard;

            setOrders((currentOrders) => {
                const remainingOrders = currentOrders.filter(
                    (order) => order.id !== updatedOrder.id,
                );

                return sortOrders([updatedOrder, ...remainingOrders]);
            });

            toast.success("Pedido enviado para entrega e cliente avisado.");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Falha ao enviar pedido para entrega.",
            );
        } finally {
            setShippingOrderId(null);
        }
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-none bg-white shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>Pedidos em preparo</CardDescription>
                        <CardTitle className="text-3xl font-bold text-slate-900">
                            {preparingCount}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        Pedidos confirmados que ainda aguardam envio.
                    </CardContent>
                </Card>

                <Card className="border-none bg-white shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>Pedidos na rua</CardDescription>
                        <CardTitle className="text-3xl font-bold text-slate-900">
                            {shippedCount}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        Clientes que ja receberam o aviso de saida.
                    </CardContent>
                </Card>

                <Card className="border-none bg-white shadow-sm">
                    <CardHeader className="pb-2">
                        <CardDescription>Conexao em tempo real</CardDescription>
                        <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                            <Radio
                                className={cn(
                                    "h-4 w-4",
                                    isSocketConnected
                                        ? "text-emerald-600"
                                        : "text-slate-400",
                                )}
                            />
                            {isSocketConnected
                                ? "Socket conectado"
                                : "Aguardando conexao"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-slate-500">
                        Novos pedidos finalizados entram aqui automaticamente.
                    </CardContent>
                </Card>
            </div>

            {orders.length === 0 ? (
                <Card className="border-none bg-white shadow-sm">
                    <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                        <div className="rounded-full bg-slate-100 p-4 text-slate-500">
                            <Package2 className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-lg font-semibold text-slate-900">
                                Nenhum pedido finalizado no momento
                            </p>
                            <p className="text-sm text-slate-500">
                                Assim que um cliente confirmar a compra no
                                WhatsApp, o card aparece aqui.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                    {orders.map((order) => {
                        const status = getStatusCopy(order.status);

                        return (
                            <Card
                                key={order.id}
                                className="border-none bg-white shadow-sm"
                            >
                                <CardHeader className="space-y-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Store className="h-4 w-4 text-primary" />
                                                <CardTitle className="text-lg text-slate-900">
                                                    {order.customerName ||
                                                        order.customerWhatsappId}
                                                </CardTitle>
                                            </div>
                                            <CardDescription>
                                                Pedido atualizado em{" "}
                                                {formatDate(order.updatedAt)}
                                            </CardDescription>
                                        </div>

                                        <Badge
                                            variant="outline"
                                            className={status.className}
                                        >
                                            {status.label}
                                        </Badge>
                                    </div>

                                    <div className="rounded-2xl bg-slate-50 p-4">
                                        <div className="flex items-start gap-3">
                                            <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                                            <div className="space-y-1">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                                    Endereco de entrega
                                                </p>
                                                <p className="text-sm text-slate-600">
                                                    {order.deliveryAddress}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    <div className="space-y-3">
                                        {order.items.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 p-3"
                                            >
                                                <div className="space-y-1">
                                                    <p className="font-medium text-slate-900">
                                                        {item.quantity}x{" "}
                                                        {item.title}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        {item.category ||
                                                            "Sem categoria"}
                                                    </p>
                                                </div>
                                                <p className="text-sm font-semibold text-slate-700">
                                                    {formatMoney(
                                                        item.subtotalCents,
                                                        order.currency,
                                                    )}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            {order.deliveryFeeCents > 0 ? (
                                                <div className="mb-2 space-y-1 text-sm text-slate-500">
                                                    <p>
                                                        Itens:{" "}
                                                        <span className="font-medium text-slate-700">
                                                            {formatMoney(
                                                                order.totalCents -
                                                                    order.deliveryFeeCents,
                                                                order.currency,
                                                            )}
                                                        </span>
                                                    </p>
                                                    <p>
                                                        Taxa de entrega:{" "}
                                                        <span className="font-medium text-slate-700">
                                                            {formatMoney(
                                                                order.deliveryFeeCents,
                                                                order.currency,
                                                            )}
                                                        </span>
                                                    </p>
                                                </div>
                                            ) : null}
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                                Valor total
                                            </p>
                                            <p className="text-2xl font-bold text-slate-900">
                                                {formatMoney(
                                                    order.totalCents,
                                                    order.currency,
                                                )}
                                            </p>
                                        </div>

                                        <Button
                                            type="button"
                                            onClick={() =>
                                                handleSendToDelivery(order.id)
                                            }
                                            disabled={
                                                order.status === "SHIPPED" ||
                                                shippingOrderId === order.id
                                            }
                                            className="min-w-52"
                                        >
                                            {shippingOrderId === order.id ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Enviando aviso...
                                                </>
                                            ) : order.status === "SHIPPED" ? (
                                                <>
                                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                                    Cliente ja avisado
                                                </>
                                            ) : (
                                                <>
                                                    <Bike className="mr-2 h-4 w-4" />
                                                    Enviar para Entrega
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
