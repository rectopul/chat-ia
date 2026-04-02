import { Injectable } from "@nestjs/common";
import {
    ChatMessage,
    ChatMessageRole,
    MediaType,
    MessageTemplate,
    MessageTemplateMedia,
    Product,
    Sale,
    TelegramUser,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type CreateChatMessageInput = {
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
        telegramId: string,
        limit: number = 10,
    ): Promise<ChatMessage[]> {
        const messages = await this.prisma.chatMessage.findMany({
            where: { telegramId },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return messages.reverse();
    }

    async getActiveProducts(): Promise<Product[]> {
        return this.prisma.product.findMany({
            where: { isActive: true },
            orderBy: { priceCents: "asc" },
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

    async getProductById(productId: string): Promise<Product | null> {
        return this.prisma.product.findUnique({
            where: { id: productId },
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
}
