import { ConfigPage } from "@/components/ConfigPageComponent";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProductType } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PixAudioConfig {
    id: string;
    audioUrl: string;
    fileName: string;
    durationSec?: number;
    isActive: boolean;
    updatedAt: string;
}

interface Product {
    id: string;
    title: string;
    priceCents: number;
}

export interface DiscountConfig {
    id: string;
    productId: string;
    discountPercent: number;
    isActive: boolean;
    product: Product;
    updatedAt: string;
}

export type SerializeProduct = {
    priceCents: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    title: string;
    description: string | null;
    currency: string;
    isActive: boolean;
    productType: ProductType;
    subscriberDays: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
export default async function Page() {
    const session = await auth();
    const products = await prisma.product.findMany();
    const botsAccounts = await prisma.botAccount.findMany();

    const serializeProduct = products.map((p) => {
        return {
            ...p,
            priceCents: p.priceCents.toString(),
        };
    });

    return (
        <ConfigPage
            products={serializeProduct}
            botsAccounts={botsAccounts}
            userEmail={session?.user?.email ?? ""}
        />
    );
}
