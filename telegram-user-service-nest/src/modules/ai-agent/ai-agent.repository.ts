import { Injectable } from "@nestjs/common";
import {
    ChatMessage,
    ChatMessageRole,
    MediaType,
    MessageDirection,
    MessageLog,
    MessageTemplate,
    MessageTemplateMedia,
    BotAccount,
    Product,
    Sale,
    TelegramUser,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type CreateChatMessageInput = {
    botId?: string | null;
    telegramId: string;
    role: ChatMessageRole;
    content: string;
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

    async getBotAccount(botId: string): Promise<BotAccount | null> {
        return this.prisma.botAccount.findUnique({
            where: { id: botId },
        });
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
                rawPayload: data.rawPayload as any,
            },
        });
    }

    private async getBotOwnerUserId(botId: string): Promise<string | null> {
        const bot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
            select: { ownerUserId: true },
        });

        return bot?.ownerUserId ?? null;
    }
}
