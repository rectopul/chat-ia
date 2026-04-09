import { ProductType } from "@prisma/client";

export type CreateProductFormState = {
    status: "idle" | "success" | "error";
    formError: string | null;
    fieldErrors: {
        title?: string;
        description?: string;
        imageUrl?: string;
        category?: string;
        price?: string;
        stockQuantity?: string;
        productType?: string;
        subscriberDays?: string;
    };
    values: {
        title: string;
        description: string;
        imageUrl: string;
        category: string;
        price: string;
        stockQuantity: string;
        productType: ProductType;
        subscriberDays: string;
    };
};

export const initialCreateProductFormState: CreateProductFormState = {
    status: "idle",
    formError: null,
    fieldErrors: {},
    values: {
        title: "",
        description: "",
        imageUrl: "",
        category: "",
        price: "",
        stockQuantity: "",
        productType: ProductType.ONE_TIME,
        subscriberDays: "",
    },
};
