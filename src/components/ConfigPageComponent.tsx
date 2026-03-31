"use client";
import { DiscountTab } from "@/components/DiscountTab";
import { PixAudioTab } from "@/components/PixAudioTab";
import { SecurityTab } from "@/components/SecurityTab";
import { BotAccount, ProductType } from "@prisma/client";
import { useState } from "react";

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
// ─── Mock botId (troque pelo seu contexto real, ex: useParams ou prop) ────────
const BOT_ID = "bot_default";

// ─────────────────────────────────────────────────────────────────────────────
export function ConfigPage({
    products,
    botsAccounts,
    userEmail,
}: {
    products: SerializeProduct[];
    botsAccounts: BotAccount[];
    userEmail: string;
}) {
    const [tab, setTab] = useState<"audio" | "discount" | "security">(
        "audio",
    );

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
            {/* Header */}
            <div className="border-b border-white/5 bg-[#0d0d14]">
                <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-sm">
                        ⚙
                    </div>
                    <div>
                        <h1 className="text-base font-semibold tracking-tight">
                            Configurações do Bot
                        </h1>
                        <p className="text-xs text-white/40 mt-0.5">
                            Áudio PIX · Desconto automático · Segurança
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="max-w-4xl mx-auto px-6 flex gap-1 pb-0">
                    {(["audio", "discount", "security"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                                tab === t
                                    ? "border-violet-500 text-violet-400"
                                    : "border-transparent text-white/40 hover:text-white/70"
                            }`}
                        >
                            {t === "audio"
                                ? "🎙 Áudio PIX"
                                : t === "discount"
                                  ? "🏷 Desconto Automático"
                                  : "🔐 Segurança"}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-8">
                {tab === "audio" ? (
                    <PixAudioTab />
                ) : tab === "discount" ? (
                    <DiscountTab
                        products={products}
                        botsAccounts={botsAccounts}
                    />
                ) : (
                    <SecurityTab userEmail={userEmail} />
                )}
            </div>
        </div>
    );
}
