import { ProductType } from "@prisma/client";

export type ProductFormValues = {
    title: string;
    description: string;
    imageUrl: string;
    category: string;
    tags: string[];
    price: string;
    promotionalPrice: string;
    stockQuantity: string;
    productType: ProductType;
    subscriberDays: string;
};

export type ProductFormState = {
    status: "idle" | "success" | "error";
    formError: string | null;
    fieldErrors: {
        title?: string;
        description?: string;
        imageUrl?: string;
        category?: string;
        tags?: string;
        price?: string;
        promotionalPrice?: string;
        stockQuantity?: string;
        productType?: string;
        subscriberDays?: string;
    };
    values: ProductFormValues;
};

export const initialProductFormValues: ProductFormValues = {
    title: "",
    description: "",
    imageUrl: "",
    category: "",
    tags: [],
    price: "",
    promotionalPrice: "",
    stockQuantity: "",
    productType: ProductType.ONE_TIME,
    subscriberDays: "",
};

export const initialProductFormState: ProductFormState = {
    status: "idle",
    formError: null,
    fieldErrors: {},
    values: initialProductFormValues,
};

export type CreateProductFormState = ProductFormState;
export const initialCreateProductFormState = initialProductFormState;
