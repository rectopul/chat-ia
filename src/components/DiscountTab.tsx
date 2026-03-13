import {
    DiscountConfig,
    SerializeProduct,
} from "@/app/admin/configuracoes/page";
import { BotAccount } from "@prisma/client";
import { useEffect, useState } from "react";
import { Textarea } from "./ui/textarea";

// ─── Mock botId (troque pelo seu contexto real, ex: useParams ou prop) ────────
const BOT_ID = "bot_default";

export function DiscountTab({
    products,
    botsAccounts,
}: {
    products: SerializeProduct[];
    botsAccounts: BotAccount[];
}) {
    const [config, setConfig] = useState<DiscountConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [productId, setProductId] = useState("");
    const [discountPercent, setDiscountPercent] = useState("10");
    const [discountText, setDiscountText] = useState("");

    useEffect(() => {
        Promise.all([
            fetch(`/api/discount-config?botId=${BOT_ID}`).then((r) => r.json()),
            fetch("/api/products?active=true").then((r) => r.json()),
        ])
            .then(([disc, prods]) => {
                if (disc) {
                    setConfig(disc);
                    setProductId(disc.productId);
                    setDiscountPercent(disc.discountPercent.toString());
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const flash = (msg: string, isError = false) => {
        if (isError) setError(msg);
        else setSuccess(msg);
        setTimeout(() => {
            setError("");
            setSuccess("");
        }, 3500);
    };

    const handleSave = async () => {
        const pct = parseInt(discountPercent);
        if (!productId) {
            flash("Selecione um produto.", true);
            return;
        }
        if (isNaN(pct) || pct < 1 || pct > 99) {
            flash("Desconto deve ser entre 1% e 99%.", true);
            return;
        }

        if (discountText === "" || null) {
            flash("Informe um texto de desconto", true);
            return;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/discount-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    botId: BOT_ID,
                    productId,
                    discountPercent: pct,
                    discountText,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setConfig(data);
            flash("Desconto salvo com sucesso!");
        } catch (e: any) {
            flash(e.message ?? "Erro ao salvar.", true);
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async () => {
        if (!config) return;
        setToggling(true);
        try {
            const res = await fetch("/api/discount-config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    botId: BOT_ID,
                    isActive: !config.isActive,
                }),
            });
            const data = await res.json();
            setConfig(data);
            flash(
                `Desconto automático ${data.isActive ? "ativado" : "desativado"}.`,
            );
        } catch {
            flash("Erro ao alterar status.", true);
        } finally {
            setToggling(false);
        }
    };

    const selectedProduct = products.find((p) => p.id === productId);
    const pct = parseInt(discountPercent) || 0;
    const discountedPrice = selectedProduct
        ? Number(selectedProduct.priceCents) * (1 - pct / 100)
        : null;

    if (loading) return <Spinner />;

    return (
        <div className="space-y-6">
            {/* Info */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300/80 leading-relaxed">
                🏷 Configure qual produto será oferecido com desconto após 4
                minutos sem compra (fluxo DONT_SELL). O desconto é aplicado
                automaticamente na geração do PIX.
            </div>

            {/* Status atual */}
            {config && (
                <div className="rounded-xl border border-white/8 bg-white/3 px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div
                                className={`w-2 h-2 rounded-full ${config.isActive ? "bg-emerald-400" : "bg-white/20"}`}
                            />
                            <div>
                                <p className="text-sm font-medium">
                                    {config.product.title}
                                </p>
                                <p className="text-xs text-white/40 mt-0.5">
                                    {fmt(config.product.priceCents)} →{" "}
                                    <span className="text-emerald-400">
                                        {fmt(
                                            config.product.priceCents *
                                                (1 -
                                                    config.discountPercent /
                                                        100),
                                        )}
                                    </span>{" "}
                                    · {config.discountPercent}% off · atualizado
                                    em {fmtDate(config.updatedAt)}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleToggle}
                            disabled={toggling}
                            className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                                config.isActive
                                    ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                                    : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                        >
                            {toggling
                                ? "..."
                                : config.isActive
                                  ? "Desativar"
                                  : "Ativar"}
                        </button>
                    </div>
                </div>
            )}

            {/* Form */}
            <div className="rounded-xl border border-white/8 bg-white/2 p-6 space-y-5">
                <h2 className="text-sm font-semibold text-white/70">
                    {config
                        ? "Atualizar configuração"
                        : "Configurar desconto automático"}
                </h2>

                <Field
                    label="Texto para o desconto"
                    hint="Informe a frase a ser exibida acima do produto com desconto"
                >
                    <Textarea
                        placeholder="Olá preparei um desconto exclusivo para você"
                        onChange={(e) => setDiscountText(e.target.value)}
                        value={discountText}
                        className="mt-1"
                        name="discount_text"
                    />
                </Field>

                <Field
                    label="Conta Telegram"
                    hint="Selecione a conta do telegram a ser usada"
                >
                    <select
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        className="w-full bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/60 transition"
                    >
                        <option value="" className="bg-[#1a1a24]">
                            Selecione uma conta...
                        </option>
                        {botsAccounts.map((b) => (
                            <option
                                key={b.id}
                                value={b.id}
                                className="bg-[#1a1a24]"
                            >
                                {b.name}
                            </option>
                        ))}
                    </select>
                </Field>

                <Field
                    label="Produto *"
                    hint="Produto que receberá o desconto na oferta DONT_SELL"
                >
                    <select
                        value={productId}
                        onChange={(e) => setProductId(e.target.value)}
                        className="w-full bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/60 transition"
                    >
                        <option value="" className="bg-[#1a1a24]">
                            Selecione um produto...
                        </option>
                        {products.map((p) => (
                            <option
                                key={p.id}
                                value={p.id}
                                className="bg-[#1a1a24]"
                            >
                                {p.title} — {fmt(Number(p.priceCents))}
                            </option>
                        ))}
                    </select>
                </Field>

                <Field
                    label="Desconto (%) *"
                    hint="Percentual de desconto aplicado na oferta"
                >
                    <div className="flex items-center gap-4">
                        <input
                            type="number"
                            min={1}
                            max={99}
                            value={discountPercent}
                            onChange={(e) => setDiscountPercent(e.target.value)}
                            className="w-28 bg-white/4 border border-white/10 rounded-lg px-4 py-2.5 text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/60 transition"
                        />
                        {/* Slider visual */}
                        <input
                            type="range"
                            min={1}
                            max={99}
                            value={discountPercent}
                            onChange={(e) => setDiscountPercent(e.target.value)}
                            className="flex-1 accent-amber-400"
                        />
                        <span className="text-amber-400 font-bold text-sm w-12 text-right">
                            {pct}%
                        </span>
                    </div>
                </Field>

                {/* Preview do preço */}
                {selectedProduct && pct > 0 && (
                    <div className="rounded-lg border border-white/6 bg-white/3 px-4 py-3 flex items-center justify-between">
                        <span className="text-xs text-white/40">
                            Preço com desconto
                        </span>
                        <div className="flex items-center gap-3 text-sm">
                            <span className="text-white/30 line-through">
                                {fmt(Number(selectedProduct.priceCents))}
                            </span>
                            <span className="text-emerald-400 font-semibold">
                                {fmt(
                                    Number(selectedProduct.priceCents) *
                                        (1 - pct / 100),
                                )}
                            </span>
                            <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">
                                -{pct}%
                            </span>
                        </div>
                    </div>
                )}

                {error && <Alert type="error">{error}</Alert>}
                {success && <Alert type="success">{success}</Alert>}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-semibold transition"
                >
                    {saving
                        ? "Salvando..."
                        : config
                          ? "Atualizar desconto"
                          : "Salvar desconto"}
                </button>
            </div>
        </div>
    );
}

function Spinner() {
    return (
        <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });

const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

// ─── Shared components ────────────────────────────────────────────────────────
function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/60">{label}</label>
            {children}
            {hint && <p className="text-xs text-white/30">{hint}</p>}
        </div>
    );
}

function Alert({
    type,
    children,
}: {
    type: "error" | "success";
    children: React.ReactNode;
}) {
    return (
        <div
            className={`rounded-lg px-4 py-2.5 text-sm ${
                type === "error"
                    ? "bg-red-500/10 border border-red-500/20 text-red-400"
                    : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            }`}
        >
            {children}
        </div>
    );
}
