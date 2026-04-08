import { fetchNestApiJson } from "@/lib/nest-api";
import { DeliveryOrderCard } from "@/lib/orders-dashboard.types";

function buildTenantHeaders(userId: string): HeadersInit {
    return {
        "x-user-id": userId,
    };
}

export async function getDeliveryOrderDashboard(
    userId: string,
): Promise<DeliveryOrderCard[]> {
    const payload = await fetchNestApiJson<{ orders: DeliveryOrderCard[] }>(
        "/delivery/orders/dashboard",
        {
            headers: buildTenantHeaders(userId),
        },
    );

    return payload.orders;
}

export async function sendDeliveryOrderToDelivery(
    orderId: string,
    userId: string,
): Promise<DeliveryOrderCard> {
    return fetchNestApiJson<DeliveryOrderCard>(
        `/delivery/orders/${orderId}/send-to-delivery`,
        {
            method: "POST",
            headers: buildTenantHeaders(userId),
        },
    );
}
