"use client";

import { useState, useTransition } from "react";
import { UserSegment } from "@prisma/client";
import {
    Zap,
    Plus,
    Info,
    Clock,
    Users,
    Repeat,
    Trash2,
    Bot,
    FileText,
    AlertTriangle,
    CheckCircle2,
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = { id: string; title: string };
type Bot = { id: string; name: string };
type Rule = {
    id: string;
    name: string;
    delaySeconds: number;
    repeatIntervalSeconds: number | null;
    segment: UserSegment;
    template: Template;
    bot: Bot;
};

interface CampaignsClientProps {
    rules: Rule[];
    templates: Template[];
    bots: Bot[];
    createRule: (formData: FormData) => Promise<{ error?: string }>;
    deleteRule: (ruleId: string) => Promise<void>;
}

// ─── Validation helper ────────────────────────────────────────────────────────

const MIN_GAP_SECONDS = 10;

function validateDelay(
    delaySeconds: number,
    botId: string,
    rules: Rule[],
    excludeId?: string,
): string | null {
    const botRules = rules
        .filter((r) => r.bot.id === botId && r.id !== excludeId)
        .map((r) => r.delaySeconds)
        .sort((a, b) => a - b);

    for (const existing of botRules) {
        if (Math.abs(existing - delaySeconds) < MIN_GAP_SECONDS) {
            return `Conflito: já existe uma regra com delay de ${existing}s. Mantenha pelo menos ${MIN_GAP_SECONDS}s de distância entre templates.`;
        }
    }
    return null;
}

// ─── Segment labels ───────────────────────────────────────────────────────────

const segmentLabels: Record<UserSegment, string> = {
    ALL: "Todos",
    NEW_USERS: "Novos Usuários",
    BUYERS: "Compradores",
    NON_BUYERS: "Não Compradores",
};

// ─── Client Component ─────────────────────────────────────────────────────────

export function CampaignsClient({
    rules,
    templates,
    bots,
    createRule,
    deleteRule,
}: CampaignsClientProps) {
    const [isPending, startTransition] = useTransition();
    const [formError, setFormError] = useState<string | null>(null);
    const [formSuccess, setFormSuccess] = useState(false);
    const [delayValue, setDelayValue] = useState("");
    const [selectedBotId, setSelectedBotId] = useState("");
    const [delayWarning, setDelayWarning] = useState<string | null>(null);

    // Live validation as user types delay
    const handleDelayChange = (value: string, botId: string) => {
        setDelayValue(value);
        setDelayWarning(null);
        const parsed = parseInt(value);
        if (!isNaN(parsed) && botId) {
            const warning = validateDelay(parsed, botId, rules);
            setDelayWarning(warning);
        }
    };

    const handleBotChange = (botId: string) => {
        setSelectedBotId(botId);
        setDelayWarning(null);
        const parsed = parseInt(delayValue);
        if (!isNaN(parsed) && botId) {
            const warning = validateDelay(parsed, botId, rules);
            setDelayWarning(warning);
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormError(null);
        setFormSuccess(false);

        const formData = new FormData(e.currentTarget);
        const delaySeconds = parseInt(formData.get("delaySeconds") as string);
        const botId = formData.get("botId") as string;

        // Client-side validation before submitting
        const error = validateDelay(delaySeconds, botId, rules);
        if (error) {
            setFormError(error);
            return;
        }

        startTransition(async () => {
            const result = await createRule(formData);
            if (result?.error) {
                setFormError(result.error);
            } else {
                setFormSuccess(true);
                setDelayValue("");
                setSelectedBotId("");
                setDelayWarning(null);
                setTimeout(() => setFormSuccess(false), 3000);
            }
        });
    };

    // Compute timeline warnings for existing rules
    const rulesByBot = rules.reduce<Record<string, Rule[]>>((acc, r) => {
        if (!acc[r.bot.id]) acc[r.bot.id] = [];
        acc[r.bot.id].push(r);
        return acc;
    }, {});

    const conflictingRuleIds = new Set<string>();
    for (const botRules of Object.values(rulesByBot)) {
        const sorted = [...botRules].sort(
            (a, b) => a.delaySeconds - b.delaySeconds,
        );
        for (let i = 0; i < sorted.length - 1; i++) {
            if (
                sorted[i + 1].delaySeconds - sorted[i].delaySeconds <
                MIN_GAP_SECONDS
            ) {
                conflictingRuleIds.add(sorted[i].id);
                conflictingRuleIds.add(sorted[i + 1].id);
            }
        }
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                    <Zap className="w-8 h-8 text-amber-500 fill-amber-500" />
                    Campanhas Timed
                </h1>
                <p className="text-slate-500">
                    Regras de disparo automático baseadas em tempo de interação
                    ou eventos.
                </p>
            </div>

            {/* Global conflict warning for existing rules */}
            {conflictingRuleIds.size > 0 && (
                <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 text-sm">
                        <strong>Atenção:</strong> existem regras com menos de{" "}
                        {MIN_GAP_SECONDS}s de intervalo entre si (destacadas em
                        vermelho na tabela). Isso pode causar envio simultâneo
                        ou sobreposto de mensagens.
                    </AlertDescription>
                </Alert>
            )}

            {/* ── Form ── */}
            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-primary" />
                        <CardTitle>Nova Regra de Mensagem</CardTitle>
                    </div>
                    <CardDescription>
                        Defina quando e para quem as mensagens serão enviadas
                        automaticamente. Templates do mesmo bot devem ter pelo
                        menos <strong>{MIN_GAP_SECONDS} segundos</strong> de
                        diferença entre si.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        onSubmit={handleSubmit}
                        className="grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">
                                Nome da Regra
                            </label>
                            <Input
                                name="name"
                                placeholder="Ex: Boas-vindas 1h"
                                required
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold">
                                Conta (Bot)
                            </label>
                            <select
                                name="botId"
                                required
                                value={selectedBotId}
                                onChange={(e) =>
                                    handleBotChange(e.target.value)
                                }
                                className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Selecionar Bot</option>
                                {bots.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Segmento de Usuário
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Público-alvo desta regra.
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <select
                                name="segment"
                                className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {Object.values(UserSegment).map((s) => (
                                    <option key={s} value={s}>
                                        {segmentLabels[s]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Delay (segundos)
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Tempo de espera após o primeiro contato.
                                        Mínimo de {MIN_GAP_SECONDS}s entre
                                        templates do mesmo bot.
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="delaySeconds"
                                type="number"
                                min={0}
                                placeholder="Ex: 10 (10s), 3600 (1h)"
                                required
                                value={delayValue}
                                onChange={(e) =>
                                    handleDelayChange(
                                        e.target.value,
                                        selectedBotId,
                                    )
                                }
                                className={`bg-slate-50/50 border-slate-200 ${
                                    delayWarning
                                        ? "border-amber-400 focus-visible:ring-amber-300"
                                        : ""
                                }`}
                            />
                            {delayWarning && (
                                <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-1">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    {delayWarning}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Repetir a cada (segundos)
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Deixe vazio para disparo único.
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="repeatIntervalSeconds"
                                type="number"
                                placeholder="Opcional"
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold">
                                Template TIMED
                            </label>
                            <select
                                name="templateId"
                                required
                                className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Selecionar Template</option>
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.title}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Feedback messages */}
                        {formError && (
                            <div className="md:col-span-3">
                                <Alert className="border-red-200 bg-red-50">
                                    <AlertTriangle className="h-4 w-4 text-red-600" />
                                    <AlertDescription className="text-red-700 text-sm">
                                        {formError}
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}

                        {formSuccess && (
                            <div className="md:col-span-3">
                                <Alert className="border-emerald-200 bg-emerald-50">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    <AlertDescription className="text-emerald-700 text-sm">
                                        Regra criada com sucesso!
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}

                        <Button
                            type="submit"
                            disabled={isPending || !!delayWarning}
                            className="md:col-span-3 w-full bg-primary hover:bg-primary/90 mt-2 disabled:opacity-50"
                        >
                            {isPending
                                ? "Criando..."
                                : "Criar Regra de Campanha"}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* ── Rules table ── */}
            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-slate-100">
                            <TableHead className="font-bold text-slate-700">
                                Regra / Segmento
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Configuração
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Template
                            </TableHead>
                            <TableHead className="text-right font-bold text-slate-700">
                                Ações
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rules.map((r) => (
                            <TableRow
                                key={r.id}
                                className={`border-slate-50 transition-colors ${
                                    conflictingRuleIds.has(r.id)
                                        ? "bg-red-50/60 hover:bg-red-50"
                                        : "hover:bg-slate-50/30"
                                }`}
                            >
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-wider">
                                            <Bot className="w-3 h-3" />
                                            {r.bot.name}
                                        </div>
                                        <div className="font-bold text-slate-900 flex items-center gap-2">
                                            {r.name}
                                            {conflictingRuleIds.has(r.id) && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="bg-red-900 text-white text-xs">
                                                        Esta regra está a menos
                                                        de {MIN_GAP_SECONDS}s de
                                                        outra regra do mesmo
                                                        bot.
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Badge
                                                variant="secondary"
                                                className="text-[10px] h-5 bg-slate-100 text-slate-600 hover:bg-slate-100 shadow-none border-none"
                                            >
                                                <Users className="w-3 h-3 mr-1" />
                                                {segmentLabels[r.segment]}
                                            </Badge>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            Delay:{" "}
                                            <span className="font-mono font-medium">
                                                {r.delaySeconds}s
                                            </span>
                                        </div>
                                        {r.repeatIntervalSeconds && (
                                            <div className="flex items-center gap-2 text-xs text-slate-600">
                                                <Repeat className="w-3.5 h-3.5 text-slate-400" />
                                                Ciclo:{" "}
                                                <span className="font-mono font-medium">
                                                    {r.repeatIntervalSeconds}s
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                                        <FileText className="w-4 h-4 text-slate-400" />
                                        {r.template.title}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                        onClick={() => deleteRule(r.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {rules.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={4}
                                    className="h-32 text-center text-slate-400 italic"
                                >
                                    Nenhuma regra configurada ainda.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
