type ProductPricingLike = {
    priceCents: number;
    promotionalPriceCents?: number | null;
};

export function getEffectiveProductPriceCents(
    product: ProductPricingLike,
): number {
    const promotionalPriceCents =
        typeof product.promotionalPriceCents === "number"
            ? product.promotionalPriceCents
            : null;

    if (
        promotionalPriceCents === null ||
        !Number.isFinite(promotionalPriceCents) ||
        promotionalPriceCents <= 0 ||
        promotionalPriceCents >= product.priceCents
    ) {
        return product.priceCents;
    }

    return promotionalPriceCents;
}

export function hasValidPromotionalPrice(product: ProductPricingLike): boolean {
    return getEffectiveProductPriceCents(product) !== product.priceCents;
}
