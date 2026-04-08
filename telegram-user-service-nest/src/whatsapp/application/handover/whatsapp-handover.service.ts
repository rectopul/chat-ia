import { Injectable } from "@nestjs/common";
import {
    WhatsappHandover,
    WhatsappHandoverStatus,
} from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class WhatsappHandoverService {
    constructor(private readonly prisma: PrismaService) {}

    async hasOpenHandover(
        instanceId: string,
        chatId: string,
    ): Promise<boolean> {
        const handover = await this.prisma.whatsappHandover.findFirst({
            where: {
                whatsappInstanceId: instanceId,
                chatId,
                status: WhatsappHandoverStatus.OPEN,
            },
            select: { id: true },
        });

        return Boolean(handover);
    }

    async openHandover(input: {
        userId: string;
        instanceId: string;
        chatId: string;
        triggerText?: string;
        lastCustomerMessage?: string;
        triggerKeywords: string[];
    }): Promise<WhatsappHandover> {
        const existing = await this.prisma.whatsappHandover.findFirst({
            where: {
                whatsappInstanceId: input.instanceId,
                chatId: input.chatId,
                status: WhatsappHandoverStatus.OPEN,
            },
            orderBy: { createdAt: "desc" },
        });

        const mergedKeywords = Array.from(
            new Set([
                ...(existing?.triggerKeywords ?? []),
                ...input.triggerKeywords,
            ]),
        );

        if (existing) {
            return this.prisma.whatsappHandover.update({
                where: { id: existing.id },
                data: {
                    triggerText: input.triggerText ?? existing.triggerText,
                    lastCustomerMessage:
                        input.lastCustomerMessage ?? existing.lastCustomerMessage,
                    triggerKeywords: mergedKeywords,
                },
            });
        }

        return this.prisma.whatsappHandover.create({
            data: {
                userId: input.userId,
                whatsappInstanceId: input.instanceId,
                chatId: input.chatId,
                triggerText: input.triggerText ?? null,
                lastCustomerMessage: input.lastCustomerMessage ?? null,
                triggerKeywords: mergedKeywords,
                status: WhatsappHandoverStatus.OPEN,
            },
        });
    }
}
