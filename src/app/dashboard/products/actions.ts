"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ProductType } from "@prisma/client";
import { requireSessionUser } from "@/lib/server-session";

export async function createUserProductAction(formData: FormData) {
    const user = await requireSessionUser();
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const priceCents = Math.round(Number(formData.get("price") ?? 0) * 100);
    const productType = String(
        formData.get("productType") ?? "ONE_TIME",
    ) as ProductType;
    const subscriberDays = String(formData.get("subscriberDays") ?? "").trim();

    await prisma.product.create({
        data: {
            ownerUserId: user.id,
            title,
            description: description || null,
            priceCents,
            productType,
            subscriberDays: subscriberDays ? Number(subscriberDays) : null,
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
