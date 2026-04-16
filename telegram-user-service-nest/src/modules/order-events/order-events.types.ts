import { OrderStatus, Prisma } from "@prisma/client";

export const ORDER_FINALIZED_EVENT = "orders:finalized";
export const ORDER_UPDATED_EVENT = "orders:updated";

export const orderRealtimeInclude = Prisma.validator<Prisma.OrderInclude>()({
    ownerUser: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
    whatsappInstance: {
        select: {
            id: true,
            instanceName: true,
            status: true,
        },
    },
    items: {
        include: {
            product: {
                select: {
                    id: true,
                    title: true,
                    category: true,
                },
            },
        },
        orderBy: {
            createdAt: "asc",
        },
    },
});

export type RealtimeOrderRecord = Prisma.OrderGetPayload<{
    include: typeof orderRealtimeInclude;
}>;

export type OrderDashboardItem = {
    id: string;
    productId: string;
    title: string;
    category: string | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
};

export type OrderDashboardCard = {
    id: string;
    ownerUserId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    whatsappInstanceId: string | null;
    whatsappInstanceName: string | null;
    customerWhatsappId: string;
    customerName: string | null;
    status: OrderStatus;
    deliveryFeeCents: number;
    totalCents: number;
    currency: string;
    deliveryAddress: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    items: OrderDashboardItem[];
};

export function mapOrderToDashboardCard(
    order: RealtimeOrderRecord,
): OrderDashboardCard {
    return {
        id: order.id,
        ownerUserId: order.ownerUserId,
        ownerName: order.ownerUser?.name ?? null,
        ownerEmail: order.ownerUser?.email ?? null,
        whatsappInstanceId: order.whatsappInstanceId,
        whatsappInstanceName: order.whatsappInstance?.instanceName ?? null,
        customerWhatsappId: order.customerWhatsappId,
        customerName: order.customerName ?? null,
        status: order.status,
        deliveryFeeCents: order.deliveryFeeCents,
        totalCents: order.totalCents,
        currency: order.currency,
        deliveryAddress: order.deliveryAddress,
        notes: order.notes ?? null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        items: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            title: item.product.title,
            category: item.product.category,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            subtotalCents: item.subtotalCents,
        })),
    };
}
