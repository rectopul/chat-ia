import { Injectable } from "@nestjs/common";
import { Product } from "@prisma/client";
import { SyncPayService } from "../../syncpay/syncpay.service";
import { AiAgentRepository } from "./ai-agent.repository";

export interface AiAgentPixCharge {
    pixMessage: string;
    product: Product;
}

@Injectable()
export class AiAgentCommerceService {
    constructor(
        private readonly repository: AiAgentRepository,
        private readonly syncPay: SyncPayService,
    ) {}

    async createPixCharge(
        botId: string,
        chatId: string,
        productId: string,
    ): Promise<AiAgentPixCharge> {
        const [product, user] = await Promise.all([
            this.repository.getProductByIdForBot(productId, botId),
            this.repository.getTelegramUserByChatId(chatId),
        ]);

        if (!product) {
            throw new Error(`Product not found: ${productId}`);
        }

        if (!user) {
            throw new Error(`Telegram user not found for chatId=${chatId}`);
        }

        const pixData = await this.syncPay.createCharge({
            amountCents: product.priceCents,
            productTitle: product.title,
            referenceId: `${chatId}-${Date.now()}`,
        });

        await this.repository.createPendingSale({
            botId,
            telegramUserId: user.telegramUserId,
            productId: product.id,
            amountCents: product.priceCents,
            referenceId: pixData.identifier,
            rawPayload: pixData,
        });

        return {
            product,
            pixMessage: this.buildPixMessage(
                product,
                pixData.pix_code,
                product.priceCents,
            ),
        };
    }

    private buildPixMessage(
        product: { title: string },
        pixCode: string,
        finalAmountCents: number,
    ): string {
        const price = (finalAmountCents / 100).toFixed(2).replace(".", ",");

        return [
            `✅ *PIX gerado com sucesso!*`,
            ``,
            `🏷️ *${product.title}*`,
            `💰 Valor: *R$ ${price}*`,
            ``,
            `📋 *Copia e Cola:*`,
            `\`${pixCode}\``,
            ``,
            `⏰ Válido por 30 minutos`,
            ``,
            `Após o pagamento você receberá a confirmação automaticamente!`,
        ].join("\n");
    }
}
