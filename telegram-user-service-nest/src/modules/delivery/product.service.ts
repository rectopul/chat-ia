import {
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, Product, ProductType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { getEffectiveProductPriceCents } from "./product-pricing";

export type SearchProductsInput = {
    instanceId?: string;
    ownerUserId?: string;
    query?: string;
    category?: string;
    onlyAvailable?: boolean;
    limit?: number;
};

export type ProductSearchResult = {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    tags: string[];
    basePriceCents: number;
    promotionalPriceCents: number | null;
    priceCents: number;
    currency: string;
    stockQuantity: number | null;
    isAvailable: boolean;
};

type ProductWithTags = Prisma.ProductGetPayload<{
    include: {
        productTags: {
            include: {
                tag: true;
            };
        };
    };
}>;

@Injectable()
export class ProductService {
    constructor(private readonly prisma: PrismaService) {}

    async searchProducts(
        input: SearchProductsInput,
    ): Promise<ProductSearchResult[]> {
        const ownerUserId = await this.resolveScopeOwnerUserId(input);
        const filters: Prisma.ProductWhereInput[] = [
            {
                isActive: true,
                ownerUserId,
                productType: ProductType.ONE_TIME,
            },
        ];
        const normalizedCategory = input.category?.trim();
        const normalizedQuery = input.query?.trim();

        if (normalizedCategory) {
            filters.push({
                category: {
                    equals: normalizedCategory,
                    mode: Prisma.QueryMode.insensitive,
                },
            });
        }

        if (normalizedQuery) {
            filters.push({
                OR: [
                    {
                        title: {
                            contains: normalizedQuery,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                    {
                        description: {
                            contains: normalizedQuery,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                    {
                        category: {
                            contains: normalizedQuery,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                    {
                        productTags: {
                            some: {
                                tag: {
                                    name: {
                                        contains: normalizedQuery,
                                        mode: Prisma.QueryMode.insensitive,
                                    },
                                },
                            },
                        },
                    },
                ],
            });
        }

        if (input.onlyAvailable !== false) {
            filters.push({
                OR: [
                    { stockQuantity: null },
                    { stockQuantity: { gt: 0 } },
                ],
            });
        }

        const products = await this.prisma.product.findMany({
            where: {
                AND: filters,
            },
            include: {
                productTags: {
                    include: {
                        tag: true,
                    },
                },
            },
            orderBy: [
                { category: "asc" },
                { title: "asc" },
            ],
            take: this.normalizeLimit(input.limit),
        });

        return products.map((product) => this.toSearchResult(product));
    }

    async getScopedProductById(
        productId: string,
        scope: Pick<SearchProductsInput, "instanceId" | "ownerUserId">,
    ): Promise<Product> {
        const ownerUserId = await this.resolveScopeOwnerUserId(scope);
        const product = await this.prisma.product.findFirst({
            where: {
                id: productId,
                ownerUserId,
                isActive: true,
                productType: ProductType.ONE_TIME,
            },
        });

        if (!product) {
            throw new NotFoundException(`Product "${productId}" not found`);
        }

        return product;
    }

    private async resolveScopeOwnerUserId(
        scope: Pick<SearchProductsInput, "instanceId" | "ownerUserId">,
    ): Promise<string | null> {
        if (scope.ownerUserId !== undefined) {
            return scope.ownerUserId;
        }

        if (!scope.instanceId) {
            return null;
        }

        const instance = await this.prisma.whatsappInstance.findUnique({
            where: { id: scope.instanceId },
            select: { userId: true },
        });

        if (!instance) {
            throw new NotFoundException(
                `WhatsApp instance "${scope.instanceId}" not found`,
            );
        }

        return instance.userId;
    }

    private normalizeLimit(limit?: number): number {
        const parsed = Math.trunc(limit ?? 10);

        if (!Number.isFinite(parsed) || parsed <= 0) {
            return 10;
        }

        return Math.min(parsed, 50);
    }

    private toSearchResult(product: ProductWithTags): ProductSearchResult {
        const effectivePriceCents = getEffectiveProductPriceCents(product);

        return {
            id: product.id,
            title: product.title,
            description: product.description,
            category: product.category,
            tags: product.productTags
                .map((entry) => entry.tag.name.trim())
                .filter(Boolean),
            basePriceCents: product.priceCents,
            promotionalPriceCents: product.promotionalPriceCents,
            priceCents: effectivePriceCents,
            currency: product.currency,
            stockQuantity: product.stockQuantity,
            isAvailable:
                product.stockQuantity === null || product.stockQuantity > 0,
        };
    }
}
