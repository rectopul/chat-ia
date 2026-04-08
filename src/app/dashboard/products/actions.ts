"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ProductType } from "@prisma/client";
import { requireSessionUser } from "@/lib/server-session";
import { z } from "zod";

const createProductSchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    category: z.string().trim().optional(),
    price: z.coerce.number().positive(),
    stockQuantity: z.string().trim().optional(),
    productType: z.nativeEnum(ProductType),
    subscriberDays: z.string().trim().optional(),
});

export async function createUserProductAction(formData: FormData) {
    const user = await requireSessionUser();
    const parsed = createProductSchema.parse({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        category: String(formData.get("category") ?? ""),
        price: Number(formData.get("price") ?? 0),
        stockQuantity: String(formData.get("stockQuantity") ?? ""),
        productType: String(formData.get("productType") ?? "ONE_TIME"),
        subscriberDays: String(formData.get("subscriberDays") ?? ""),
    });
    const stockQuantity = parsed.stockQuantity
        ? Number(parsed.stockQuantity)
        : null;
    const subscriberDays = parsed.subscriberDays
        ? Number(parsed.subscriberDays)
        : null;

    if (
        (stockQuantity !== null &&
            (!Number.isInteger(stockQuantity) || stockQuantity < 0)) ||
        (subscriberDays !== null &&
            (!Number.isInteger(subscriberDays) || subscriberDays <= 0))
    ) {
        return;
    }

    await prisma.product.create({
        data: {
            ownerUserId: user.id,
            title: parsed.title,
            description: parsed.description || null,
            category: parsed.category || null,
            stockQuantity,
            priceCents: Math.round(parsed.price * 100),
            productType: parsed.productType,
            subscriberDays,
        },
    });

    revalidatePath("/dashboard/products");
}

export async function deleteUserProductAction(formData: FormData) {
    const user = await requireSessionUser();
    const id = String(formData.get("id") ?? "");

    await prisma.product.deleteMany({
        where: { id, ownerUserId: user.id },
    });

    revalidatePath("/dashboard/products");
}

export async function toggleUserProductActiveAction(
    productId: string,
    isActive: boolean,
) {
    const user = await requireSessionUser();

    await prisma.product.updateMany({
        where: {
            id: productId,
            ownerUserId: user.id,
        },
        data: {
            isActive: !isActive,
        },
    });

    revalidatePath("/dashboard/products");
}
