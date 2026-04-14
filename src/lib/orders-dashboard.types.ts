export const ORDER_FINALIZED_EVENT = "orders:finalized";
export const ORDER_UPDATED_EVENT = "orders:updated";

export type DeliveryOrderItem = {
    id: string;
    productId: string;
    title: string;
    category: string | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
};

export type DeliveryOrderCard = {
    id: string;
    ownerUserId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    whatsappInstanceId: string | null;
    whatsappInstanceName: string | null;
    customerWhatsappId: string;
    customerName: string | null;
    status: "PENDING" | "PREPARING" | "SHIPPED" | "DELIVERED";
    deliveryFeeCents: number;
    totalCents: number;
    currency: string;
    deliveryAddress: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    items: DeliveryOrderItem[];
};
