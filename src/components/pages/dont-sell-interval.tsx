"use client";
// app/admin/dont-sell-intervals/page.tsx  (ou componente dentro de settings)

import { useState, useEffect } from "react";
import {
    Clock,
    Plus,
    Trash2,
    AlertTriangle,
    CheckCircle2,
    Timer,
    Info,
    Zap,
    ArrowRight,
} from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Interval {
    id: string;
    botId: string;
    delaySeconds: number;
    order: number;
    isActive: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDelay(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return s > 0 ? `${m}min ${s}s` : `${m} minuto${m > 1 ? "s" : ""}`;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}min` : `${h} hora${h > 1 ? "s" : ""}`;
}

function parseHumanInput(value: string): number | null {
    const v = value.trim().toLowerCase();

    // Aceita formatos: "4m", "4min", "1h", "1h30m", "5h", "90s", "3600"
    const hoursMatch = v.match(
        /^(\d+(?:\.\d+)?)\s*h(?:oras?|r?s?)?(?:\s*(\d+)\s*m(?:in)?)?$/,
    );
    const minsMatch = v.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:utos?)?)?$/);
    const secsMatch = v.match(/^(\d+)\s*s(?:eg(?:undos?)?)?$/);
    const plainMatch = v.match(/^\d+$/);

    if (hoursMatch) {
        const h = parseFloat(hoursMatch[1]);
        const m = parseInt(hoursMatch[2] ?? "0");
        return Math.round(h * 3600 + m * 60);
    }
    if (minsMatch) return Math.round(parseFloat(minsMatch[1]) * 60);
    if (secsMatch) return parseInt(secsMatch[1]);
    if (plainMatch) return parseInt(v); // assume segundos

    return null;
}

// ─── Interval Card ────────────────────────────────────────────────────────────

function IntervalCard({
    interval,
    index,
    total,
    onDelete,
}: {
    interval: Interval;
    index: number;
    total: number;
    onDelete: (id: string) => void;
}) {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await onDelete(interval.id);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm group">
            {/* Ordem */}
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {index + 1}
            </div>

            {/* Ícone de seta entre disparos */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <Timer className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">
                        {formatDelay(interval.delaySeconds)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                        após o primeiro contato
                    </p>
                </div>
            </div>

            {/* Badge de intervalo desde o anterior */}
            {index > 0 && (
                <Badge
                    variant="secondary"
                    className="text-[10px] bg-slate-100 text-slate-500 shrink-0"
                >
                    +{formatDelay(interval.delaySeconds)}
                </Badge>
            )}
            {index === 0 && (
                <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 shrink-0">
                    Primeiro disparo
                </Badge>
            )}

            {/* Seta para o próximo */}
            {index < total - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            )}

            {/* Delete */}
            <Button
                variant="ghost"
                size="icon"
                disabled={deleting}
                onClick={handleDelete}
                className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0 h-8 w-8"
            >
                {deleting ? (
                    <div className="w-3.5 h-3.5 border border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                )}
            </Button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
    botId: string;
}

export function DontSellIntervalsManager({ botId }: Props) {
    const [intervals, setIntervals] = useState<Interval[]>([]);
    const [loading, setLoading] = useState(true);
    const [inputValue, setInputValue] = useState("");
    const [inputError, setInputError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    // ── Fetch ───────────────────────────────────────────────────────────────

    useEffect(() => {
        fetch(`/api/dont-sell-intervals?botId=${botId}`)
            .then((r) => r.json())
            .then(setIntervals)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [botId]);

    // ── Validação ao digitar ────────────────────────────────────────────────

    const handleInputChange = (value: string) => {
        setInputValue(value);
        setInputError(null);

        if (!value.trim()) return;

        const parsed = parseHumanInput(value);
        if (parsed === null) {
            setInputError(
                "Formato inválido. Use: 4min, 1h, 1h30m, 90s ou segundos.",
            );
            return;
        }
        if (parsed < 60) {
            setInputError("Mínimo de 60 segundos (1 minuto).");
            return;
        }

        // Verifica duplicata
        const duplicate = intervals.find((i) => i.delaySeconds === parsed);
        if (duplicate) {
            setInputError(`Já existe um intervalo de ${formatDelay(parsed)}.`);
        }
    };

    const parsedPreview = inputValue.trim()
        ? parseHumanInput(inputValue)
        : null;

    // ── Add ─────────────────────────────────────────────────────────────────

    const handleAdd = async () => {
        const delaySeconds = parseHumanInput(inputValue);
        if (!delaySeconds || delaySeconds < 60 || inputError) return;

        setSaving(true);
        try {
            const res = await fetch("/api/dont-sell-intervals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ botId, delaySeconds }),
            });
            const data = await res.json();
            if (!res.ok) {
                setInputError(data.error ?? "Erro ao salvar.");
                return;
            }
            setIntervals((prev) =>
                [...prev, data].sort((a, b) => a.delaySeconds - b.delaySeconds),
            );
            setInputValue("");
            setSuccess(true);
            setTimeout(() => setSuccess(false), 2000);
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ──────────────────────────────────────────────────────────────

    const handleDelete = async (id: string) => {
        const res = await fetch(`/api/dont-sell-intervals?id=${id}`, {
            method: "DELETE",
        });
        if (res.ok) {
            setIntervals((prev) => prev.filter((i) => i.id !== id));
        }
    };

    // ── Render ──────────────────────────────────────────────────────────────

    const sorted = [...intervals].sort(
        (a, b) => a.delaySeconds - b.delaySeconds,
    );

    return (
        <Card className="border-none shadow-sm">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <CardTitle className="text-base">
                            Intervalos de Reenvio DONT_SELL
                        </CardTitle>
                        <CardDescription className="mt-0.5">
                            Quando um usuário termina o fluxo sem comprar, o
                            sistema agenda o template DONT_SELL para cada
                            intervalo abaixo.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* Como funciona */}
                <div className="flex gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-600">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="font-medium text-slate-700">
                            Como funciona
                        </p>
                        <p>
                            A cron job verifica a fila de{" "}
                            <code className="bg-slate-200 px-1 rounded">
                                ScheduledMessageJob
                            </code>{" "}
                            e envia o DONT_SELL nos horários exatos. Os jobs são
                            criados automaticamente quando o usuário termina o
                            fluxo de boas-vindas.
                        </p>
                        <p className="text-slate-500">
                            Exemplo com 3 intervalos (4min, 1h, 5h): o usuário
                            receberá o DONT_SELL às <strong>T+4min</strong>,{" "}
                            <strong>T+1h</strong> e <strong>T+5h</strong> após o
                            primeiro contato — mas somente se ainda não tiver
                            comprado.
                        </p>
                    </div>
                </div>

                {/* Input de novo intervalo */}
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        Novo Intervalo
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="w-3.5 h-3.5 text-slate-400" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                                Formatos aceitos: <strong>4min</strong>,{" "}
                                <strong>1h</strong>, <strong>1h30m</strong>,{" "}
                                <strong>5h</strong>, <strong>90s</strong> ou
                                segundos puros (ex: <strong>3600</strong>)
                            </TooltipContent>
                        </Tooltip>
                    </label>

                    <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    value={inputValue}
                                    onChange={(e) =>
                                        handleInputChange(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                        e.key === "Enter" &&
                                        !inputError &&
                                        handleAdd()
                                    }
                                    placeholder="ex: 4min, 1h, 1h30m, 5h"
                                    className={`pl-9 bg-slate-50/50 border-slate-200 font-mono
                                        ${inputError ? "border-red-300 focus-visible:ring-red-200" : ""}
                                        ${parsedPreview && !inputError ? "border-emerald-300 focus-visible:ring-emerald-200" : ""}
                                    `}
                                />
                            </div>

                            {/* Preview do valor parseado */}
                            {parsedPreview && !inputError && (
                                <p className="text-[11px] text-emerald-600 flex items-center gap-1 px-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    {formatDelay(parsedPreview)} após o primeiro
                                    contato
                                </p>
                            )}
                            {inputError && (
                                <p className="text-[11px] text-red-500 flex items-center gap-1 px-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    {inputError}
                                </p>
                            )}
                        </div>

                        <Button
                            onClick={handleAdd}
                            disabled={
                                saving ||
                                !!inputError ||
                                !inputValue.trim() ||
                                !parsedPreview
                            }
                            className={`shrink-0 transition-colors ${
                                success
                                    ? "bg-emerald-500 hover:bg-emerald-600"
                                    : ""
                            }`}
                        >
                            {saving ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : success ? (
                                <CheckCircle2 className="w-4 h-4" />
                            ) : (
                                <Plus className="w-4 h-4" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Lista de intervalos */}
                <div className="space-y-2">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400 py-4 justify-center">
                            <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
                            Carregando intervalos…
                        </div>
                    ) : sorted.length === 0 ? (
                        <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                            <Timer className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                            <p className="text-sm text-slate-400 font-medium">
                                Nenhum intervalo cadastrado
                            </p>
                            <p className="text-xs text-slate-300 mt-1">
                                Sem intervalos, o DONT_SELL não será reagendado.
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                                {sorted.length} intervalo
                                {sorted.length > 1 ? "s" : ""} configurado
                                {sorted.length > 1 ? "s" : ""}
                            </p>
                            {sorted.map((interval, idx) => (
                                <IntervalCard
                                    key={interval.id}
                                    interval={interval}
                                    index={idx}
                                    total={sorted.length}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </>
                    )}
                </div>

                {/* Aviso se não houver template DONT_SELL */}
                {sorted.length > 0 && (
                    <p className="text-[11px] text-slate-400 flex items-start gap-1.5 px-1">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Os jobs só são criados se existir um template com a
                        chave{" "}
                        <code className="bg-slate-100 px-1 rounded font-mono">
                            DONT_SELL
                        </code>{" "}
                        ativo. Configure em Templates.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
