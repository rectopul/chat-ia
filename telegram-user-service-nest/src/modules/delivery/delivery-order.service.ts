import axios from "axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Order, OrderStatus } from "@prisma/client";
import { OrderEventsService } from "../order-events/order-events.service";
import {
    orderRealtimeInclude,
    RealtimeOrderRecord,
} from "../order-events/order-events.types";
import { PrismaService } from "../../prisma/prisma.service";
import { TemporaryCartService } from "./temporary-cart.service";

type SyncOrderInput = {
    ownerUserId: string;
    instanceId: string;
    whatsappId: string;
    deliveryAddress?: string | null;
};

@Injectable()
export class DeliveryOrderService {
    private readonly logger = new Logger(DeliveryOrderService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
        private readonly temporaryCartService: TemporaryCartService,
        private readonly orderEventsService: OrderEventsService,
    ) {}

    async saveLocationAndSyncDraftOrder(input: {
        ownerUserId: string;
        instanceId: string;
        whatsappId: string;
        latitude: number;
        longitude: number;
    }): Promise<{ address: string; order: Order }> {
        const address = await this.reverseGeocode(
            input.latitude,
            input.longitude,
        );

        await this.temporaryCartService.setDeliveryAddress(
            input.whatsappId,
            address,
        );

        const order = await this.syncPendingOrderFromCart({
            ownerUserId: input.ownerUserId,
            instanceId: input.instanceId,
            whatsappId: input.whatsappId,
            deliveryAddress: address,
        });

        return { address, order };
    }

    async syncPendingOrderFromCart(input: SyncOrderInput): Promise<Order> {
        const cart = await this.temporaryCartService.getCart(input.whatsappId);
        const deliveryAddress =
            input.deliveryAddress?.trim() || cart.deliveryAddress?.trim();

        if (!deliveryAddress) {
            throw new Error(
                "Nao foi possivel sincronizar o pedido: endereco de entrega ausente",
            );
        }

        const [existingOrder, customer] = await Promise.all([
            this.prisma.order.findFirst({
                where: {
                    whatsappInstanceId: input.instanceId,
                    customerWhatsappId: input.whatsappId,
                    status: OrderStatus.PENDING,
                },
                orderBy: { createdAt: "desc" },
            }),
            this.prisma.whatsappCustomer.findUnique({
                where: {
                    ownerUserId_whatsappId: {
                        ownerUserId: input.ownerUserId,
                        whatsappId: input.whatsappId,
                    },
                },
                select: {
                    displayName: true,
                },
            }),
        ]);

        const orderData = {
            ownerUserId: input.ownerUserId,
            whatsappInstanceId: input.instanceId,
            customerWhatsappId: input.whatsappId,
            customerName: customer?.displayName ?? existingOrder?.customerName ?? null,
            status: OrderStatus.PENDING,
            totalCents: cart.totalCents,
            currency: cart.currency,
            deliveryAddress,
        };

        if (existingOrder) {
            return this.prisma.order.update({
                where: { id: existingOrder.id },
                data: {
                    ...orderData,
                    items: {
                        deleteMany: {},
                        ...(cart.items.length
                            ? {
                                  create: cart.items.map((item) => ({
                                      productId: item.productId,
                                      quantity: item.quantity,
                                      unitPriceCents: item.unitPriceCents,
                                      subtotalCents: item.subtotalCents,
                                  })),
                              }
                            : {}),
                    },
                },
            });
        }

        return this.prisma.order.create({
            data: {
                ...orderData,
                ...(cart.items.length
                    ? {
                          items: {
                              create: cart.items.map((item) => ({
                                  productId: item.productId,
                                  quantity: item.quantity,
                                  unitPriceCents: item.unitPriceCents,
                                  subtotalCents: item.subtotalCents,
                              })),
                          },
                      }
                    : {}),
            },
        });
    }

    async finalizePendingOrder(input: {
        instanceId: string;
        whatsappId: string;
    }): Promise<RealtimeOrderRecord | null> {
        const order = await this.prisma.order.findFirst({
            where: {
                whatsappInstanceId: input.instanceId,
                customerWhatsappId: input.whatsappId,
                status: OrderStatus.PENDING,
            },
            include: orderRealtimeInclude,
            orderBy: { createdAt: "desc" },
        });

        if (!order) {
            return null;
        }

        if (!order.deliveryAddress.trim() || !order.items.length) {
            this.logger.debug(
                `[finalizePendingOrder] pedido incompleto orderId=${order.id} address=${Boolean(
                    order.deliveryAddress.trim(),
                )} items=${order.items.length}`,
            );
            return null;
        }

        const finalizedOrder = await this.prisma.order.update({
            where: { id: order.id },
            data: {
                status: OrderStatus.PREPARING,
            },
            include: orderRealtimeInclude,
        });

        this.orderEventsService.emitOrderFinalized(finalizedOrder);

        return finalizedOrder;
    }

    private async reverseGeocode(
        latitude: number,
        longitude: number,
    ): Promise<string> {
        const fallback = `Localizacao compartilhada: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        const baseUrl =
            this.configService
                .get<string>("WHATSAPP_REVERSE_GEOCODE_URL")
                ?.trim() || "https://nominatim.openstreetmap.org/reverse";

        try {
            const response = await axios.get(baseUrl, {
                params: {
                    lat: latitude,
                    lon: longitude,
                    format: "jsonv2",
                    addressdetails: 1,
                },
                timeout: Number(
                    this.configService.get(
                        "WHATSAPP_REVERSE_GEOCODE_TIMEOUT_MS",
                        8000,
                    ),
                ),
                headers: {
                    "User-Agent":
                        this.configService.get<string>(
                            "WHATSAPP_REVERSE_GEOCODE_USER_AGENT",
                        ) || "chat-telegram-xand/1.0",
                },
            });

            const address = String(
                response.data?.display_name ??
                    this.buildAddressFromParts(response.data?.address) ??
                    fallback,
            ).trim();

            return address || fallback;
        } catch (error) {
            this.logger.warn(
                `[reverseGeocode] falha ao converter localizacao (${latitude}, ${longitude}): ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );

            return fallback;
        }
    }

    private buildAddressFromParts(
        address?: Record<string, unknown>,
    ): string | null {
        if (!address) {
            return null;
        }

        const parts = [
            address.road,
            address.house_number,
            address.suburb,
            address.city,
            address.town,
            address.state,
            address.postcode,
        ]
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean);

        return parts.length ? parts.join(", ") : null;
    }
}
