import { Injectable } from "@nestjs/common";
import {
    BusinessProfile,
    ChatMessage,
    ChatMessageType,
    ChatMessageRole,
    DeliveryType,
    MediaType,
    MessageDirection,
    MessageTemplate,
    MessageTemplateMedia,
    PaymentMethod,
    Prisma,
    Product,
    ProductType,
    Sale,
    Subscription,
    SubscriptionStatus,
    TelegramUser,
    UserAccessStatus,
    UserRole,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type CreateChatMessageInput = {
    botId?: string | null;
    telegramId: string;
    role: ChatMessageRole;
    content: string;
    mediaUrl?: string | null;
    messageType?: ChatMessageType;
    aiModel?: string | null;
    promptTokenCount?: number | null;
    candidatesTokenCount?: number | null;
    totalTokenCount?: number | null;
};

export type WhatsappInstanceAccessContext = {
    instanceId: string;
    instanceName: string;
    ownerUserId: string;
    personaName: string;
    businessProfile: BusinessProfile;
    subscriptionStatus: SubscriptionStatus | null;
    hasActiveAccess: boolean;
};

export type DeliveryCatalogProduct = Prisma.ProductGetPayload<{
    include: {
        productTags: {
            include: {
                tag: true;
            };
        };
    };
}>;

export type BotAccountWithOwnerSettings = Prisma.BotAccountGetPayload<{
    include: {
        ownerUser: {
            select: {
                name: true;
                assistantName: true;
                businessProfile: true;
            };
        };
    };
}>;

export type OwnerCheckoutSettings = {
    establishmentName: string;
    establishmentAddress: string | null;
    acceptedPaymentMethods: PaymentMethod[];
    availableDeliveryTypes: DeliveryType[];
};

@Injectable()
export class AiAgentRepository {
    constructor(private readonly prisma: PrismaService) {}

    async createMessage(data: CreateChatMessageInput): Promise<ChatMessage> {
        return this.prisma.chatMessage.create({
            data,
        });
    }

    async getRecentMessages(
        botId: string,
        telegramId: string,
        limit: number = 10,
    ): Promise<ChatMessage[]> {
        const scopedMessages = await this.prisma.chatMessage.findMany({
            where: { botId, telegramId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        if (scopedMessages.length) {
            return scopedMessages.reverse();
        }

        const legacyMessages = await this.prisma.chatMessage.findMany({
            where: {
                telegramId,
                botId: null,
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return legacyMessages.reverse();
    }

    async getConversationMessages(
        conversationKey: string,
        limit: number = 10,
    ): Promise<ChatMessage[]> {
        const messages = await this.prisma.chatMessage.findMany({
            where: {
                botId: null,
                telegramId: conversationKey,
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return messages.reverse();
    }

    async getActiveProducts(): Promise<Product[]> {
        return this.prisma.product.findMany({
            where: { isActive: true, ownerUserId: null },
            orderBy: { priceCents: "asc" },
        });
    }

    async getActiveProductsForBot(botId: string): Promise<Product[]> {
        const ownerUserId = await this.getBotOwnerUserId(botId);

        return this.prisma.product.findMany({
            where: {
                isActive: true,
                ownerUserId,
            },
            orderBy: { priceCents: "asc" },
        });
    }

    async getActiveProductsForOwner(ownerUserId: string): Promise<Product[]> {
        return this.prisma.product.findMany({
            where: {
                isActive: true,
                ownerUserId,
            },
            orderBy: { priceCents: "asc" },
        });
    }

    async getActiveDeliveryProductsForOwner(
        ownerUserId: string,
    ): Promise<DeliveryCatalogProduct[]> {
        return this.prisma.product.findMany({
            where: {
                isActive: true,
                ownerUserId,
                productType: ProductType.ONE_TIME,
            },
            include: {
                productTags: {
                    include: {
                        tag: true,
                    },
                },
            },
            orderBy: [{ category: "asc" }, { title: "asc" }],
        });
    }

    async getBotAccount(botId: string): Promise<BotAccountWithOwnerSettings | null> {
        return this.prisma.botAccount.findUnique({
            where: { id: botId },
            include: {
                ownerUser: {
                    select: {
                        name: true,
                        assistantName: true,
                        businessProfile: true,
                    },
                },
            },
        });
    }

    async getOwnerCheckoutSettings(
        ownerUserId: string,
    ): Promise<OwnerCheckoutSettings> {
        const [botAccount, ownerUser] = await Promise.all([
            this.prisma.botAccount.findFirst({
                where: {
                    ownerUserId,
                    isActive: true,
                },
                orderBy: { createdAt: "asc" },
                select: {
                    name: true,
                    acceptedPaymentMethods: true,
                    availableDeliveryTypes: true,
                },
            }),
            this.prisma.user.findUnique({
                where: { id: ownerUserId },
                select: {
                    name: true,
                    storeAddress: true,
                    acceptedPaymentMethods: true,
                    availableDeliveryTypes: true,
                },
            }),
        ]);

        return {
            establishmentName:
                botAccount?.name?.trim() ||
                ownerUser?.name?.trim() ||
                "estabelecimento",
            establishmentAddress: ownerUser?.storeAddress?.trim() || null,
            acceptedPaymentMethods:
                ownerUser?.acceptedPaymentMethods?.length
                    ? ownerUser.acceptedPaymentMethods
                    : botAccount?.acceptedPaymentMethods?.length
                      ? botAccount.acceptedPaymentMethods
                    : [PaymentMethod.PIX_ONLINE],
            availableDeliveryTypes:
                ownerUser?.availableDeliveryTypes?.length
                    ? ownerUser.availableDeliveryTypes
                    : botAccount?.availableDeliveryTypes?.length
                      ? botAccount.availableDeliveryTypes
                    : [DeliveryType.DELIVERY],
        };
    }

    async getActivePreviewTemplates(): Promise<
        Array<
            MessageTemplate & {
                mediaItems: MessageTemplateMedia[];
            }
        >
    > {
        return this.prisma.messageTemplate.findMany({
            where: {
                isActive: true,
                ownerUserId: null,
                OR: [
                    { type: { in: [MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO] } },
                    { mediaUrl: { not: null } },
                    { mediaItems: { some: {} } },
                ],
            },
            include: {
                mediaItems: {
                    orderBy: { order: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async getActivePreviewTemplatesForOwner(
        ownerUserId: string,
    ): Promise<
        Array<
            MessageTemplate & {
                mediaItems: MessageTemplateMedia[];
            }
        >
    > {
        return this.prisma.messageTemplate.findMany({
            where: {
                isActive: true,
                ownerUserId,
                OR: [
                    {
                        type: {
                            in: [MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO],
                        },
                    },
                    { mediaUrl: { not: null } },
                    { mediaItems: { some: {} } },
                ],
            },
            include: {
                mediaItems: {
                    orderBy: { order: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async getActivePreviewTemplatesForBot(
        botId: string,
    ): Promise<
        Array<
            MessageTemplate & {
                mediaItems: MessageTemplateMedia[];
            }
        >
    > {
        const ownerUserId = await this.getBotOwnerUserId(botId);

        return this.prisma.messageTemplate.findMany({
            where: {
                isActive: true,
                ownerUserId,
                OR: [
                    {
                        type: {
                            in: [MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO],
                        },
                    },
                    { mediaUrl: { not: null } },
                    { mediaItems: { some: {} } },
                ],
            },
            include: {
                mediaItems: {
                    orderBy: { order: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        });
    }

    async getTemplatesByIds(
        ids: string[],
    ): Promise<
        Array<
            MessageTemplate & {
                mediaItems: MessageTemplateMedia[];
            }
        >
    > {
        if (!ids.length) {
            return [];
        }

        return this.prisma.messageTemplate.findMany({
            where: {
                id: { in: ids },
                isActive: true,
            },
            include: {
                mediaItems: {
                    orderBy: { order: "asc" },
                },
            },
        });
    }

    async getTelegramUserByChatId(
        chatId: string,
    ): Promise<TelegramUser | null> {
        return this.prisma.telegramUser.findUnique({
            where: { chatId },
        });
    }

    async getRecentlySentPreviewMediaUrls(
        botId: string,
        chatId: string,
        limit: number = 20,
    ): Promise<string[]> {
        const user = await this.getTelegramUserByChatId(chatId);
        if (!user) {
            return [];
        }

        const logs = await this.prisma.messageLog.findMany({
            where: {
                botId,
                telegramUserId: user.telegramUserId,
                direction: MessageDirection.OUT,
                mediaUrl: { not: null },
                type: { in: [MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO] },
            },
            select: { mediaUrl: true },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return logs
            .map((log) => log.mediaUrl)
            .filter((mediaUrl): mediaUrl is string => Boolean(mediaUrl));
    }

    async createMessageLogs(
        data: Array<{
            botId: string;
            telegramUserId: string;
            direction: MessageDirection;
            type: MediaType;
            text?: string | null;
            mediaUrl?: string | null;
            providerMessageId?: string | null;
        }>,
    ): Promise<void> {
        if (!data.length) {
            return;
        }

        await this.prisma.messageLog.createMany({
            data,
        });
    }

    async getProductById(productId: string): Promise<Product | null> {
        return this.prisma.product.findUnique({
            where: { id: productId },
        });
    }

    async getProductByIdForBot(
        productId: string,
        botId: string,
    ): Promise<Product | null> {
        const ownerUserId = await this.getBotOwnerUserId(botId);

        return this.prisma.product.findFirst({
            where: {
                id: productId,
                ownerUserId,
            },
        });
    }

    async createPendingSale(data: {
        botId: string;
        telegramUserId: string;
        productId: string;
        amountCents: number;
        referenceId: string;
        rawPayload: unknown;
    }): Promise<Sale> {
        return this.prisma.sale.create({
            data: {
                botId: data.botId,
                telegramUserId: data.telegramUserId,
                productId: data.productId,
                amountCents: data.amountCents,
                referenceId: data.referenceId,
                status: "PENDING",
                provider: "SYNCPAY",
                rawPayload: data.rawPayload as Prisma.InputJsonValue,
            },
        });
    }

    async getWhatsappInstanceAccessContext(
        instanceId: string,
    ): Promise<WhatsappInstanceAccessContext | null> {
        const instance = await this.prisma.whatsappInstance.findUnique({
            where: { id: instanceId },
            include: {
                user: {
                    include: {
                        subscription: true,
                    },
                },
            },
        });

        if (!instance) {
            return null;
        }

        return {
            instanceId: instance.id,
            instanceName: instance.instanceName,
            ownerUserId: instance.userId,
            personaName:
                instance.user.assistantName?.trim() ||
                instance.instanceName.trim() ||
                instance.user.name?.trim() ||
                "Clara",
            businessProfile: instance.user.businessProfile,
            subscriptionStatus: instance.user.subscription?.status ?? null,
            hasActiveAccess: this.hasUserActiveAccess(
                instance.user.role,
                instance.user.accessStatus,
                instance.user.subscription,
            ),
        };
    }

    private async getBotOwnerUserId(botId: string): Promise<string | null> {
        const bot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
            select: { ownerUserId: true },
        });

        return bot?.ownerUserId ?? null;
    }

    private hasUserActiveAccess(
        role: UserRole,
        accessStatus: UserAccessStatus,
        subscription: Subscription | null,
    ): boolean {
        if (role === UserRole.SUPER_ADMIN) {
            return true;
        }

        if (accessStatus === UserAccessStatus.BANNED) {
            return false;
        }

        if (!subscription) {
            return false;
        }

        const now = new Date();

        if (subscription.status === SubscriptionStatus.ACTIVE) {
            return !subscription.endDate || subscription.endDate >= now;
        }

        if (subscription.status === SubscriptionStatus.PAST_DUE) {
            return !!subscription.graceUntil && subscription.graceUntil >= now;
        }

        if (subscription.status === SubscriptionStatus.CANCELED) {
            return !!subscription.endDate && subscription.endDate >= now;
        }

        return false;
    }
}
