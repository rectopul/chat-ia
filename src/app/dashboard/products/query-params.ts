import { Prisma } from "@prisma/client";

export type ProductSortField =
    | "createdAt"
    | "title"
    | "category"
    | "price"
    | "stock"
    | "status";

export type SortDirection = "asc" | "desc";

export const DEFAULT_PRODUCT_SORT_FIELD: ProductSortField = "createdAt";
export const DEFAULT_PRODUCT_SORT_DIRECTION: SortDirection = "desc";

export function parseProductSortField(
    value?: string,
): ProductSortField {
    switch (value) {
        case "title":
        case "category":
        case "price":
        case "stock":
        case "status":
        case "createdAt":
            return value;
        default:
            return DEFAULT_PRODUCT_SORT_FIELD;
    }
}

export function parseSortDirection(value?: string): SortDirection {
    return value === "asc" ? "asc" : "desc";
}

export function buildProductsOrderBy(
    sortField: ProductSortField,
    sortDirection: SortDirection,
): Prisma.ProductOrderByWithRelationInput[] {
    switch (sortField) {
        case "title":
            return [{ title: sortDirection }, { createdAt: "desc" }];
        case "category":
            return [{ category: sortDirection }, { title: "asc" }];
        case "price":
            return [{ priceCents: sortDirection }, { title: "asc" }];
        case "stock":
            return [{ stockQuantity: sortDirection }, { title: "asc" }];
        case "status":
            return [{ isActive: sortDirection }, { title: "asc" }];
        case "createdAt":
        default:
            return [{ createdAt: sortDirection }, { title: "asc" }];
    }
}

export function buildProductsPageHref(input: {
    page?: number;
    query?: string;
    sortField?: ProductSortField;
    sortDirection?: SortDirection;
}): string {
    const params = new URLSearchParams();

    if (input.page && input.page > 1) {
        params.set("page", String(input.page));
    }

    if (input.query?.trim()) {
        params.set("q", input.query.trim());
    }

    if (input.sortField && input.sortField !== DEFAULT_PRODUCT_SORT_FIELD) {
        params.set("sort", input.sortField);
    }

    if (
        input.sortDirection &&
        input.sortDirection !== DEFAULT_PRODUCT_SORT_DIRECTION
    ) {
        params.set("dir", input.sortDirection);
    }

    const queryString = params.toString();

    return queryString
        ? `/dashboard/products?${queryString}`
        : "/dashboard/products";
}
