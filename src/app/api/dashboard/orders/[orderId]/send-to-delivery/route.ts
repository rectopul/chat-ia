import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendDeliveryOrderToDelivery } from "@/lib/orders-dashboard";
import { NestApiError } from "@/lib/nest-api";

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ orderId: string }> },
) {
    const session = await auth();

    if (!session?.user?.id || session.user.isSuperAdmin) {
        return NextResponse.json(
            { error: "Sessao invalida para enviar pedidos." },
            { status: 401 },
        );
    }

    try {
        const { orderId } = await params;
        const order = await sendDeliveryOrderToDelivery(
            orderId,
            session.user.id,
        );

        return NextResponse.json(order);
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel enviar o pedido para entrega.",
            },
            {
                status:
                    error instanceof NestApiError ? error.status : 500,
            },
        );
    }
}
