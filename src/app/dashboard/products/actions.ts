"use server";

import { ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/server-session";
import {
    CreateProductFormState,
    initialCreateProductFormState,
} from "./form-state";

const optionalUrlSchema = z
    .string()
    .trim()
    .optional()
    .transform((value) => value || "")
    .refine(
        (value) => !value || /^https?:\/\/.+/i.test(value),
        "Informe uma URL de imagem valida com http:// ou https://.",
    );

const createProductSchema = z.object({
    title: z.string().trim().min(1, "Informe o nome do produto."),
    description: z.string().trim().optional(),
    imageUrl: optionalUrlSchema,
    category: z.string().trim().optional(),
    price: z.coerce
        .number()
        .positive("Informe um preco maior que zero."),
    stockQuantity: z.string().trim().optional(),
    productType: z.nativeEnum(ProductType),
    subscriberDays: z.string().trim().optional(),
});

export async function createUserProductAction(
    _prevState: CreateProductFormState | undefined,
    formData: FormData,
): Promise<CreateProductFormState> {
    const user = await requireSessionUser();
    const rawValues = {
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        imageUrl: String(formData.get("imageUrl") ?? "").trim(),
        category: String(formData.get("category") ?? "").trim(),
        price: String(formData.get("price") ?? "").trim(),
        stockQuantity: String(formData.get("stockQuantity") ?? "").trim(),
        productType: String(formData.get("productType") ?? ProductType.ONE_TIME),
        subscriberDays: String(formData.get("subscriberDays") ?? "").trim(),
    };

    const parsed = createProductSchema.safeParse({
        ...rawValues,
        price: rawValues.price ? Number(rawValues.price.replace(",", ".")) : 0,
        productType: rawValues.productType,
    });

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;

        return {
            status: "error",
            formError: "Revise os campos destacados para salvar o produto.",
            fieldErrors: {
                title: fieldErrors.title?.[0],
                description: fieldErrors.description?.[0],
                imageUrl: fieldErrors.imageUrl?.[0],
                category: fieldErrors.category?.[0],
                price: fieldErrors.price?.[0],
                stockQuantity: fieldErrors.stockQuantity?.[0],
                productType: fieldErrors.productType?.[0],
                subscriberDays: fieldErrors.subscriberDays?.[0],
            },
            values: {
                ...rawValues,
                productType:
                    rawValues.productType === ProductType.SUBSCRIPTION
                        ? ProductType.SUBSCRIPTION
                        : ProductType.ONE_TIME,
            },
        };
    }

    const stockQuantity = parsed.data.stockQuantity
        ? Number(parsed.data.stockQuantity)
        : null;
    const subscriberDays = parsed.data.subscriberDays
        ? Number(parsed.data.subscriberDays)
        : null;

    if (
        stockQuantity !== null &&
        (!Number.isInteger(stockQuantity) || stockQuantity < 0)
    ) {
        return {
            status: "error",
            formError: "Informe um estoque valido.",
            fieldErrors: {
                stockQuantity: "Use um numero inteiro igual ou maior que zero.",
            },
            values: {
                ...rawValues,
                productType: parsed.data.productType,
            },
        };
    }

    if (
        parsed.data.productType === ProductType.SUBSCRIPTION &&
        (!subscriberDays ||
            !Number.isInteger(subscriberDays) ||
            subscriberDays <= 0)
    ) {
        return {
            status: "error",
            formError: "Informe a duracao da assinatura.",
            fieldErrors: {
                subscriberDays: "Use um numero inteiro maior que zero.",
            },
            values: {
                ...rawValues,
                productType: parsed.data.productType,
            },
        };
    }

    await prisma.product.create({
        data: {
            ownerUserId: user.id,
            title: parsed.data.title,
            description: parsed.data.description || null,
            imageUrl: parsed.data.imageUrl || null,
            category: parsed.data.category || null,
            stockQuantity,
            priceCents: Math.round(parsed.data.price * 100),
            productType: parsed.data.productType,
            subscriberDays:
                parsed.data.productType === ProductType.SUBSCRIPTION
                    ? subscriberDays
                    : null,
        },
    });

    revalidatePath("/dashboard/products");

    return {
        status: "success",
        formError: null,
        fieldErrors: {},
        values: initialCreateProductFormState.values,
    };
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
