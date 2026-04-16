import {
    BadRequestException,
    Injectable,
    Logger,
    OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Product } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
    DELIVERY_CART_KEY_PREFIX,
    DELIVERY_CART_TTL_SECONDS,
} from "./delivery.constants";
import { ProductService, SearchProductsInput } from "./product.service";
import { getEffectiveProductPriceCents } from "./product-pricing";

const IORedis = require("ioredis");

export type TemporaryCartItem = {
    productId: string;
    title: string;
    category: string | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
    stockQuantity: number | null;
};

export type TemporaryCart = {
    whatsappId: string;
    instanceId: string | null;
    ownerUserId: string | null;
    items: TemporaryCartItem[];
    subtotalCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    currency: string;
    deliveryAddress: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
};

@Injectable()
export class TemporaryCartService implements OnModuleDestroy {
    private readonly logger = new Logger(TemporaryCartService.name);
    private readonly redis: any;

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly productService: ProductService,
    ) {
        if (process.env.REDIS_URL) {
            this.redis = new IORedis(process.env.REDIS_URL);
        } else {
            this.redis = new IORedis({
                host: process.env.REDIS_HOST ?? "localhost",
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD || undefined,
                db: Number(process.env.REDIS_DB ?? 0),
            });
        }

        this.redis.on("error", (error: Error) => {
            this.logger.error(
                `[redis] falha no carrinho temporario: ${error.message}`,
                error.stack,
            );
        });
    }

    async onModuleDestroy(): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            await this.redis.quit();
        } catch (error: any) {
            this.logger.debug(
                `[redis] erro ao encerrar carrinho temporario: ${error?.message ?? error}`,
            );
        }
    }

    async getCart(whatsappId: string): Promise<TemporaryCart> {
        const normalizedWhatsappId = this.normalizeWhatsappId(whatsappId);
        return (
            (await this.loadCart(normalizedWhatsappId)) ??
            this.buildEmptyCart(normalizedWhatsappId)
        );
    }

    async addProduct(
        whatsappId: string,
        input: {
            productId: string;
            quantity?: number;
            instanceId?: string;
            ownerUserId?: string;
        },
    ): Promise<TemporaryCart> {
        const normalizedWhatsappId = this.normalizeWhatsappId(whatsappId);
        const quantity = this.normalizeQuantity(input.quantity);
        const product = await this.productService.getScopedProductById(
            input.productId,
            {
                instanceId: input.instanceId,
                ownerUserId: input.ownerUserId,
            },
        );
        const cart = await this.getCart(normalizedWhatsappId);

        this.assertCartScope(cart, input);

        const existingItem = cart.items.find(
            (item) => item.productId === product.id,
        );
        const nextQuantity = (existingItem?.quantity ?? 0) + quantity;

        this.assertProductAvailability(product, nextQuantity);

        if (existingItem) {
            const effectivePriceCents = getEffectiveProductPriceCents(product);
            existingItem.quantity = nextQuantity;
            existingItem.unitPriceCents = effectivePriceCents;
            existingItem.subtotalCents = effectivePriceCents * nextQuantity;
            existingItem.stockQuantity = product.stockQuantity;
            existingItem.category = product.category;
        } else {
            cart.items.push(this.toCartItem(product, nextQuantity));
        }

        return this.saveCart(
            normalizedWhatsappId,
            await this.recalculateCart({
                ...cart,
                instanceId: cart.instanceId ?? input.instanceId ?? null,
                ownerUserId: cart.ownerUserId ?? product.ownerUserId ?? null,
            }),
        );
    }

    async setItemQuantity(
        whatsappId: string,
        productId: string,
        quantity: number,
        scope: Pick<SearchProductsInput, "instanceId" | "ownerUserId"> = {},
    ): Promise<TemporaryCart> {
        const normalizedWhatsappId = this.normalizeWhatsappId(whatsappId);
        const normalizedQuantity = Math.trunc(quantity);

        if (normalizedQuantity <= 0) {
            return this.removeProduct(normalizedWhatsappId, productId);
        }

        const product = await this.productService.getScopedProductById(
            productId,
            scope,
        );
        this.assertProductAvailability(product, normalizedQuantity);

        const cart = await this.getCart(normalizedWhatsappId);
        this.assertCartScope(cart, scope);

        const item = cart.items.find((entry) => entry.productId === productId);
        if (!item) {
            throw new BadRequestException(
                `Product "${productId}" is not present in the temporary cart`,
            );
        }

        item.quantity = normalizedQuantity;
        item.unitPriceCents = getEffectiveProductPriceCents(product);
        item.subtotalCents = item.unitPriceCents * normalizedQuantity;
        item.stockQuantity = product.stockQuantity;
        item.category = product.category;

        return this.saveCart(
            normalizedWhatsappId,
            await this.recalculateCart(cart),
        );
    }

    async removeProduct(
        whatsappId: string,
        productId: string,
    ): Promise<TemporaryCart> {
        const normalizedWhatsappId = this.normalizeWhatsappId(whatsappId);
        const cart = await this.getCart(normalizedWhatsappId);

        return this.saveCart(
            normalizedWhatsappId,
            await this.recalculateCart({
                ...cart,
                items: cart.items.filter((item) => item.productId !== productId),
            }),
        );
    }

    async setDeliveryAddress(
        whatsappId: string,
        deliveryAddress: string,
    ): Promise<TemporaryCart> {
        const normalizedWhatsappId = this.normalizeWhatsappId(whatsappId);
        const cart = await this.getCart(normalizedWhatsappId);

        return this.saveCart(normalizedWhatsappId, {
            ...(await this.recalculateCart(cart)),
            deliveryAddress: deliveryAddress.trim(),
        });
    }

    async clearCart(whatsappId: string): Promise<void> {
        await this.redis.del(this.cartKey(this.normalizeWhatsappId(whatsappId)));
    }

    private async loadCart(whatsappId: string): Promise<TemporaryCart | null> {
        const rawCart = await this.redis.get(this.cartKey(whatsappId));

        if (!rawCart) {
            return null;
        }

        try {
            return this.recalculateCart(JSON.parse(rawCart) as TemporaryCart);
        } catch (error: any) {
            this.logger.warn(
                `[loadCart] payload invalido para ${whatsappId}: ${error?.message ?? error}`,
            );
            await this.clearCart(whatsappId);
            return null;
        }
    }

    private async saveCart(
        whatsappId: string,
        cart: TemporaryCart,
    ): Promise<TemporaryCart> {
        const now = new Date().toISOString();
        const nextCart: TemporaryCart = {
            ...cart,
            createdAt: cart.createdAt || now,
            updatedAt: now,
        };

        await this.redis.set(
            this.cartKey(whatsappId),
            JSON.stringify(nextCart),
            "EX",
            Number(
                this.configService.get(
                    "DELIVERY_CART_TTL_SECONDS",
                    DELIVERY_CART_TTL_SECONDS,
                ),
            ),
        );

        return nextCart;
    }

    private buildEmptyCart(whatsappId: string): TemporaryCart {
        const now = new Date().toISOString();

        return {
            whatsappId,
            instanceId: null,
            ownerUserId: null,
            items: [],
            subtotalCents: 0,
            deliveryFeeCents: 0,
            totalCents: 0,
            currency: "BRL",
            deliveryAddress: null,
            notes: null,
            createdAt: now,
            updatedAt: now,
        };
    }

    private async recalculateCart(cart: TemporaryCart): Promise<TemporaryCart> {
        const items = cart.items.map((item) => ({
            ...item,
            subtotalCents: item.unitPriceCents * item.quantity,
        }));
        const subtotalCents = items.reduce(
            (sum, item) => sum + item.subtotalCents,
            0,
        );
        const configuredDeliveryFeeCents = await this.resolveDeliveryFeeCents(
            cart.ownerUserId,
        );
        const deliveryFeeCents = items.length ? configuredDeliveryFeeCents : 0;
        const totalCents = subtotalCents + deliveryFeeCents;

        return {
            ...cart,
            items,
            subtotalCents,
            deliveryFeeCents,
            totalCents,
        };
    }

    private async resolveDeliveryFeeCents(
        ownerUserId: string | null,
    ): Promise<number> {
        if (!ownerUserId) {
            return 0;
        }

        const owner = await this.prisma.user.findUnique({
            where: { id: ownerUserId },
            select: { deliveryFeeCents: true },
        });

        return Math.max(0, owner?.deliveryFeeCents ?? 0);
    }

    private toCartItem(product: Product, quantity: number): TemporaryCartItem {
        const effectivePriceCents = getEffectiveProductPriceCents(product);

        return {
            productId: product.id,
            title: product.title,
            category: product.category,
            quantity,
            unitPriceCents: effectivePriceCents,
            subtotalCents: effectivePriceCents * quantity,
            stockQuantity: product.stockQuantity,
        };
    }

    private assertProductAvailability(
        product: Product,
        requestedQuantity: number,
    ): void {
        if (product.stockQuantity === 0) {
            throw new BadRequestException(
                `Product "${product.title}" is currently unavailable`,
            );
        }

        if (
            product.stockQuantity !== null &&
            requestedQuantity > product.stockQuantity
        ) {
            throw new BadRequestException(
                `Requested quantity exceeds stock for "${product.title}"`,
            );
        }
    }

    private assertCartScope(
        cart: TemporaryCart,
        scope: Pick<SearchProductsInput, "instanceId" | "ownerUserId">,
    ): void {
        if (
            cart.instanceId &&
            scope.instanceId &&
            cart.instanceId !== scope.instanceId
        ) {
            throw new BadRequestException(
                "Temporary cart is already associated with another WhatsApp instance",
            );
        }

        if (
            cart.ownerUserId &&
            scope.ownerUserId &&
            cart.ownerUserId !== scope.ownerUserId
        ) {
            throw new BadRequestException(
                "Temporary cart is already associated with another catalog owner",
            );
        }
    }

    private normalizeWhatsappId(whatsappId: string): string {
        const normalized = whatsappId.trim();

        if (!normalized) {
            throw new BadRequestException("whatsappId is required");
        }

        return normalized;
    }

    private normalizeQuantity(quantity?: number): number {
        const normalized = Math.trunc(quantity ?? 1);

        if (!Number.isFinite(normalized) || normalized <= 0) {
            throw new BadRequestException(
                "quantity must be a positive integer",
            );
        }

        return normalized;
    }

    private cartKey(whatsappId: string): string {
        return `${DELIVERY_CART_KEY_PREFIX}:${whatsappId}`;
    }
}
