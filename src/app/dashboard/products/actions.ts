"use server";

import { ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/server-session";
import {
    ProductFormState,
    ProductFormValues,
    initialProductFormState,
} from "./form-state";

const optionalUrlSchema = z
    .string()
    .trim()
    .optional()
    .transform((value) => value || "")
    .refine(
        (value) => !value || /^(https?:\/\/.+|\/.+)/i.test(value),
        "Informe uma imagem valida para o produto.",
    );

const productFormSchema = z.object({
    title: z.string().trim().min(1, "Informe o nome do produto."),
    description: z.string().trim().optional(),
    imageUrl: optionalUrlSchema,
    category: z.string().trim().optional(),
    price: z.coerce.number().positive("Informe um preco maior que zero."),
    promotionalPrice: z.coerce.number().positive().optional(),
    stockQuantity: z.string().trim().optional(),
    productType: z.nativeEnum(ProductType),
    subscriberDays: z.string().trim().optional(),
});

type PreparedProductPayload = {
    parsed: z.infer<typeof productFormSchema>;
    values: ProductFormValues;
    tags: Awaited<ReturnType<typeof ensureUserTags>>;
    stockQuantity: number | null;
    subscriberDays: number | null;
    promotionalPriceCents: number | null;
};

function normalizeTagName(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function buildTagKey(value: string) {
    return normalizeTagName(value).toLocaleLowerCase("pt-BR");
}

function parseMoneyValue(rawValue: string): number | undefined {
    const normalized = rawValue.trim();

    if (!normalized) {
        return undefined;
    }

    return Number(normalized.replace(",", "."));
}

function parseTagNames(rawValue: FormDataEntryValue | null): string[] {
    const raw = String(rawValue ?? "").trim();

    if (!raw) {
        return [];
    }

    let values: string[] = [];

    try {
        const parsed = JSON.parse(raw) as unknown;

        if (Array.isArray(parsed)) {
            values = parsed.map((value) => String(value ?? ""));
        } else {
            values = [raw];
        }
    } catch {
        values = raw.split(",");
    }

    const uniqueTags = new Map<string, string>();

    for (const value of values) {
        const normalizedValue = normalizeTagName(value);

        if (!normalizedValue) {
            continue;
        }

        if (normalizedValue.length > 80) {
            throw new Error(
                `A tag "${normalizedValue}" ultrapassa o limite de 80 caracteres.`,
            );
        }

        const key = buildTagKey(normalizedValue);

        if (!uniqueTags.has(key)) {
            uniqueTags.set(key, normalizedValue);
        }
    }

    return [...uniqueTags.values()];
}

function buildRawValues(formData: FormData): ProductFormValues {
    return {
        title: String(formData.get("title") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        imageUrl: String(formData.get("imageUrl") ?? "").trim(),
        category: String(formData.get("category") ?? "").trim(),
        tags: parseTagNames(formData.get("tags")),
        price: String(formData.get("price") ?? "").trim(),
        promotionalPrice: String(formData.get("promotionalPrice") ?? "").trim(),
        stockQuantity: String(formData.get("stockQuantity") ?? "").trim(),
        productType: normalizeProductType(
            String(formData.get("productType") ?? ProductType.ONE_TIME),
        ),
        subscriberDays: String(formData.get("subscriberDays") ?? "").trim(),
    };
}

function normalizeProductType(value: string): ProductType {
    return value === ProductType.SUBSCRIPTION
        ? ProductType.SUBSCRIPTION
        : ProductType.ONE_TIME;
}

function buildErrorState(
    values: ProductFormValues,
    overrides: Partial<ProductFormState["fieldErrors"]>,
    formError: string,
): ProductFormState {
    return {
        status: "error",
        formError,
        fieldErrors: overrides,
        values: {
            ...values,
            productType: normalizeProductType(String(values.productType)),
        },
    };
}

async function ensureUserTags(userId: string, tagNames: string[]) {
    if (!tagNames.length) {
        return [];
    }

    const existingTags = await prisma.tag.findMany({
        where: {
            subscriberId: userId,
        },
        select: {
            id: true,
            name: true,
        },
    });
    const existingByKey = new Map(
        existingTags.map((tag) => [buildTagKey(tag.name), tag]),
    );
    const tagsToCreate = tagNames.filter(
        (tagName) => !existingByKey.has(buildTagKey(tagName)),
    );

    if (tagsToCreate.length) {
        await prisma.tag.createMany({
            data: tagsToCreate.map((tagName) => ({
                subscriberId: userId,
                name: tagName,
            })),
            skipDuplicates: true,
        });
    }

    const refreshedTags = await prisma.tag.findMany({
        where: {
            subscriberId: userId,
        },
        select: {
            id: true,
            name: true,
        },
    });
    const refreshedByKey = new Map(
        refreshedTags.map((tag) => [buildTagKey(tag.name), tag]),
    );

    return tagNames
        .map((tagName) => refreshedByKey.get(buildTagKey(tagName)))
        .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
}

async function prepareProductPayload(
    userId: string,
    rawValues: ProductFormValues,
): Promise<
    | { ok: true; payload: PreparedProductPayload }
    | { ok: false; state: ProductFormState }
> {
    const parsed = productFormSchema.safeParse({
        ...rawValues,
        price: parseMoneyValue(rawValues.price) ?? 0,
        promotionalPrice: parseMoneyValue(rawValues.promotionalPrice),
        productType: rawValues.productType,
    });

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;

        return {
            ok: false,
            state: {
                status: "error",
                formError: "Revise os campos destacados para salvar o produto.",
                fieldErrors: {
                    title: fieldErrors.title?.[0],
                    description: fieldErrors.description?.[0],
                    imageUrl: fieldErrors.imageUrl?.[0],
                    category: fieldErrors.category?.[0],
                    tags: undefined,
                    price: fieldErrors.price?.[0],
                    promotionalPrice: fieldErrors.promotionalPrice?.[0],
                    stockQuantity: fieldErrors.stockQuantity?.[0],
                    productType: fieldErrors.productType?.[0],
                    subscriberDays: fieldErrors.subscriberDays?.[0],
                },
                values: {
                    ...rawValues,
                    productType: normalizeProductType(String(rawValues.productType)),
                },
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
            ok: false,
            state: buildErrorState(
                rawValues,
                {
                    stockQuantity:
                        "Use um numero inteiro igual ou maior que zero.",
                },
                "Informe um estoque valido.",
            ),
        };
    }

    if (
        parsed.data.productType === ProductType.SUBSCRIPTION &&
        (!subscriberDays ||
            !Number.isInteger(subscriberDays) ||
            subscriberDays <= 0)
    ) {
        return {
            ok: false,
            state: buildErrorState(
                rawValues,
                {
                    subscriberDays: "Use um numero inteiro maior que zero.",
                },
                "Informe a duracao da assinatura.",
            ),
        };
    }

    const promotionalPriceCents =
        typeof parsed.data.promotionalPrice === "number"
            ? Math.round(parsed.data.promotionalPrice * 100)
            : null;
    const priceCents = Math.round(parsed.data.price * 100);

    if (
        promotionalPriceCents !== null &&
        promotionalPriceCents >= priceCents
    ) {
        return {
            ok: false,
            state: buildErrorState(
                rawValues,
                {
                    promotionalPrice:
                        "O preco promocional precisa ser menor que o preco principal.",
                },
                "Revise o valor promocional informado.",
            ),
        };
    }

    try {
        const tags = await ensureUserTags(userId, rawValues.tags);

        return {
            ok: true,
            payload: {
                parsed: parsed.data,
                values: rawValues,
                tags,
                stockQuantity,
                subscriberDays,
                promotionalPriceCents,
            },
        };
    } catch (error) {
        return {
            ok: false,
            state: buildErrorState(
                rawValues,
                {
                    tags: "Revise as tags informadas.",
                },
                error instanceof Error
                    ? error.message
                    : "Nao foi possivel salvar as tags do produto.",
            ),
        };
    }
}

function buildProductData(
    userId: string,
    payload: PreparedProductPayload,
) {
    return {
        ownerUserId: userId,
        title: payload.parsed.title,
        description: payload.parsed.description || null,
        imageUrl: payload.parsed.imageUrl || null,
        category: payload.parsed.category || null,
        stockQuantity: payload.stockQuantity,
        priceCents: Math.round(payload.parsed.price * 100),
        promotionalPriceCents: payload.promotionalPriceCents,
        productType: payload.parsed.productType,
        subscriberDays:
            payload.parsed.productType === ProductType.SUBSCRIPTION
                ? payload.subscriberDays
                : null,
    };
}

export async function createUserProductAction(
    _prevState: ProductFormState | undefined,
    formData: FormData,
): Promise<ProductFormState> {
    const user = await requireSessionUser();
    const rawValues = buildRawValues(formData);
    const prepared = await prepareProductPayload(user.id, rawValues);

    if (!prepared.ok) {
        return prepared.state;
    }

    const { payload } = prepared;

    await prisma.product.create({
        data: {
            ...buildProductData(user.id, payload),
            productTags: payload.tags.length
                ? {
                      create: payload.tags.map((tag) => ({
                          subscriberId: user.id,
                          tagId: tag.id,
                      })),
                  }
                : undefined,
        },
    });

    revalidatePath("/dashboard/products");

    return {
        status: "success",
        formError: null,
        fieldErrors: {},
        values: initialProductFormState.values,
    };
}

export async function updateUserProductAction(
    _prevState: ProductFormState | undefined,
    formData: FormData,
): Promise<ProductFormState> {
    const user = await requireSessionUser();
    const productId = String(formData.get("productId") ?? "").trim();

    if (!productId) {
        return buildErrorState(
            buildRawValues(formData),
            {},
            "Produto invalido para edicao.",
        );
    }

    const product = await prisma.product.findFirst({
        where: {
            id: productId,
            ownerUserId: user.id,
        },
        select: {
            id: true,
        },
    });

    if (!product) {
        return buildErrorState(
            buildRawValues(formData),
            {},
            "Produto nao encontrado para este assinante.",
        );
    }

    const rawValues = buildRawValues(formData);
    const prepared = await prepareProductPayload(user.id, rawValues);

    if (!prepared.ok) {
        return prepared.state;
    }

    const { payload } = prepared;

    await prisma.$transaction([
        prisma.product.update({
            where: { id: productId },
            data: buildProductData(user.id, payload),
        }),
        prisma.productTags.deleteMany({
            where: {
                subscriberId: user.id,
                productId,
            },
        }),
        ...(payload.tags.length
            ? [
                  prisma.productTags.createMany({
                      data: payload.tags.map((tag) => ({
                          subscriberId: user.id,
                          productId,
                          tagId: tag.id,
                      })),
                      skipDuplicates: true,
                  }),
              ]
            : []),
    ]);

    revalidatePath("/dashboard/products");

    return {
        status: "success",
        formError: null,
        fieldErrors: {},
        values: initialProductFormState.values,
    };
}

export async function updateUserProductTagsAction(formData: FormData) {
    const user = await requireSessionUser();
    const productId = String(formData.get("productId") ?? "").trim();
    const tagNames = parseTagNames(formData.get("tags"));

    if (!productId) {
        throw new Error("Produto invalido para atualizar tags.");
    }

    const product = await prisma.product.findFirst({
        where: {
            id: productId,
            ownerUserId: user.id,
        },
        select: {
            id: true,
        },
    });

    if (!product) {
        throw new Error("Produto nao encontrado para este assinante.");
    }

    const tags = await ensureUserTags(user.id, tagNames);

    await prisma.$transaction([
        prisma.productTags.deleteMany({
            where: {
                subscriberId: user.id,
                productId,
            },
        }),
        ...(tags.length
            ? [
                  prisma.productTags.createMany({
                      data: tags.map((tag) => ({
                          subscriberId: user.id,
                          productId,
                          tagId: tag.id,
                      })),
                      skipDuplicates: true,
                  }),
              ]
            : []),
    ]);

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
