import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, Tag } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type SubscriberTagListItem = {
    id: string;
    name: string;
    productCount: number;
};

export type ProductTagAssignmentSummary = {
    productId: string;
    tags: Array<{
        id: string;
        name: string;
    }>;
    totalTags: number;
};

@Injectable()
export class TagService {
    constructor(private readonly prisma: PrismaService) {}

    async createTag(subscriberId: string, name: string): Promise<Tag> {
        const normalizedSubscriberId = this.normalizeRequiredValue(
            subscriberId,
            "subscriberId",
        );
        const normalizedName = this.normalizeTagName(name);
        const existingTag = await this.prisma.tag.findFirst({
            where: {
                subscriberId: normalizedSubscriberId,
                name: {
                    equals: normalizedName,
                    mode: Prisma.QueryMode.insensitive,
                },
            },
        });

        if (existingTag) {
            return existingTag;
        }

        return this.prisma.tag.create({
            data: {
                subscriberId: normalizedSubscriberId,
                name: normalizedName,
            },
        });
    }

    async attachTagsToProduct(input: {
        subscriberId: string;
        productId: string;
        tagIds: string[];
    }): Promise<ProductTagAssignmentSummary> {
        const subscriberId = this.normalizeRequiredValue(
            input.subscriberId,
            "subscriberId",
        );
        const productId = this.normalizeRequiredValue(
            input.productId,
            "productId",
        );
        const tagIds = this.normalizeTagIds(input.tagIds);

        if (!tagIds.length) {
            return this.getProductTagAssignmentSummary(subscriberId, productId);
        }

        await this.ensureSubscriberProduct(subscriberId, productId);
        await this.ensureSubscriberTags(subscriberId, tagIds);

        await this.prisma.productTags.createMany({
            data: tagIds.map((tagId) => ({
                subscriberId,
                productId,
                tagId,
            })),
            skipDuplicates: true,
        });

        return this.getProductTagAssignmentSummary(subscriberId, productId);
    }

    async detachTagsFromProduct(input: {
        subscriberId: string;
        productId: string;
        tagIds: string[];
    }): Promise<ProductTagAssignmentSummary> {
        const subscriberId = this.normalizeRequiredValue(
            input.subscriberId,
            "subscriberId",
        );
        const productId = this.normalizeRequiredValue(
            input.productId,
            "productId",
        );
        const tagIds = this.normalizeTagIds(input.tagIds);

        await this.ensureSubscriberProduct(subscriberId, productId);

        if (tagIds.length) {
            await this.prisma.productTags.deleteMany({
                where: {
                    subscriberId,
                    productId,
                    tagId: {
                        in: tagIds,
                    },
                },
            });
        }

        return this.getProductTagAssignmentSummary(subscriberId, productId);
    }

    async listSubscriberTagsWithProductCount(
        subscriberId: string,
    ): Promise<SubscriberTagListItem[]> {
        const normalizedSubscriberId = this.normalizeRequiredValue(
            subscriberId,
            "subscriberId",
        );
        const tags = await this.prisma.tag.findMany({
            where: {
                subscriberId: normalizedSubscriberId,
            },
            select: {
                id: true,
                name: true,
                _count: {
                    select: {
                        productTags: true,
                    },
                },
            },
            orderBy: {
                name: "asc",
            },
        });

        return tags.map((tag) => ({
            id: tag.id,
            name: tag.name,
            productCount: tag._count.productTags,
        }));
    }

    private async ensureSubscriberProduct(
        subscriberId: string,
        productId: string,
    ): Promise<void> {
        const product = await this.prisma.product.findFirst({
            where: {
                id: productId,
                ownerUserId: subscriberId,
            },
            select: {
                id: true,
            },
        });

        if (!product) {
            throw new NotFoundException(
                `Product "${productId}" not found for subscriber`,
            );
        }
    }

    private async ensureSubscriberTags(
        subscriberId: string,
        tagIds: string[],
    ): Promise<void> {
        const tags = await this.prisma.tag.findMany({
            where: {
                subscriberId,
                id: {
                    in: tagIds,
                },
            },
            select: {
                id: true,
            },
        });
        const foundIds = new Set(tags.map((tag) => tag.id));
        const missingTagIds = tagIds.filter((tagId) => !foundIds.has(tagId));

        if (missingTagIds.length) {
            throw new NotFoundException(
                `Tag ids not found for subscriber: ${missingTagIds.join(", ")}`,
            );
        }
    }

    private async getProductTagAssignmentSummary(
        subscriberId: string,
        productId: string,
    ): Promise<ProductTagAssignmentSummary> {
        await this.ensureSubscriberProduct(subscriberId, productId);

        const productTags = await this.prisma.productTags.findMany({
            where: {
                subscriberId,
                productId,
            },
            select: {
                tag: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                tag: {
                    name: "asc",
                },
            },
        });

        return {
            productId,
            tags: productTags.map((entry) => entry.tag),
            totalTags: productTags.length,
        };
    }

    private normalizeTagIds(tagIds: string[]): string[] {
        return [...new Set((tagIds ?? []).map((tagId) => String(tagId).trim()))]
            .filter(Boolean);
    }

    private normalizeTagName(name: string): string {
        const normalizedName = String(name ?? "")
            .trim()
            .replace(/\s+/g, " ");

        if (!normalizedName) {
            throw new BadRequestException("Tag name is required");
        }

        if (normalizedName.length > 80) {
            throw new BadRequestException("Tag name is too long");
        }

        return normalizedName;
    }

    private normalizeRequiredValue(value: string, fieldName: string): string {
        const normalizedValue = String(value ?? "").trim();

        if (!normalizedValue) {
            throw new BadRequestException(`${fieldName} is required`);
        }

        return normalizedValue;
    }
}
