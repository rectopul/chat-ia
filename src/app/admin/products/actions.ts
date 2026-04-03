"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { ProductType } from "@prisma/client";
import { requireSuperAdminUser } from "@/lib/server-session";

export async function createAdminProductAction(formData: FormData) {
    await requireSuperAdminUser();

    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const priceCents = Math.round(Number(formData.get("price") ?? 0) * 100);
    const productType = String(formData.get("productType") ?? "") as ProductType;
    const subscriberDays = formData.get("subscriberDays")
        ? parseInt(String(formData.get("subscriberDays") ?? ""), 10)
        : null;

    await prisma.product.create({
        data: {
            title,
            description,
            priceCents,
            productType,
            subscriberDays,
        },
    });

    revalidatePath("/admin/products");
}

export async function deleteAdminProductAction(formData: FormData) {
    await requireSuperAdminUser();

    const id = String(formData.get("id") ?? "");
    await prisma.product.delete({ where: { id } });

    revalidatePath("/admin/products");
}
