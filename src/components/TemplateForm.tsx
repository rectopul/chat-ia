"use client";
import { useState } from "react";
import { MediaUploader } from "./MediaUploader";
import {
    Plus,
    Trash2,
    Check,
    FileText,
    Image as ImageIcon,
    Video,
    Mic,
    Layers,
    Info,
    Loader2,
    GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateId } from "@/lib/services";

const TEMPLATE_KEYS = ["WELCOME", "DONT_SELL", "SUBSCRIBER_CONTENT", "TIMED"];
const MEDIA_TYPES = ["TEXT", "IMAGE", "VIDEO", "AUDIO", "COMBO"];

interface ComboItem {
    localId: string;
    type: string;
    url: string;
    tagsInput: string;
    uploading: boolean;
}

interface Props {
    onSubmit: (data: {
        key: string;
        title: string;
        type: string;
        text?: string;
        mediaUrl?: string;
        tags?: string[];
        comboItems?: { type: string; url: string; tags?: string[] }[];
    }) => Promise<void>;
}

// Detecta o tipo de mídia a partir de uma URL
function detectTypeFromUrl(url: string): string {
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "IMAGE";
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "VIDEO";
    if (["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(ext))
        return "AUDIO";
    return "IMAGE";
}

export function TemplateForm({ onSubmit }: Props) {
    const [key, setKey] = useState(TEMPLATE_KEYS[0]);
    const [title, setTitle] = useState("");
    const [type, setType] = useState("TEXT");
    const [text, setText] = useState("");
    const [mediaUrl, setMediaUrl] = useState("");
    const [tagsInput, setTagsInput] = useState("");
    const [mainUploading, setMainUploading] = useState(false);
    const [comboItems, setComboItems] = useState<ComboItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    const anyUploading = mainUploading || comboItems.some((i) => i.uploading);

    // ── Combo helpers ─────────────────────────────────────────────────────

    // Chamado pelo MediaUploader do COMBO cada vez que um arquivo é concluído
    const onComboUploaded = (url: string) => {
        const detectedType = detectTypeFromUrl(url);
        setComboItems((prev) => [
            ...prev,
            {
                localId: generateId(),
                type: detectedType,
                url,
                tagsInput: "",
                uploading: false,
            },
        ]);
    };

    const removeComboItem = (localId: string) => {
        setComboItems((prev) => prev.filter((i) => i.localId !== localId));
    };

    const updateComboType = (localId: string, newType: string) => {
        setComboItems((prev) =>
            prev.map((i) =>
                i.localId === localId ? { ...i, type: newType } : i,
            ),
        );
    };

    const updateComboTags = (localId: string, nextTagsInput: string) => {
        setComboItems((prev) =>
            prev.map((i) =>
                i.localId === localId
                    ? { ...i, tagsInput: nextTagsInput }
                    : i,
            ),
        );
    };

    // ── Submit ────────────────────────────────────────────────────────────

    const canSubmit =
        !saving &&
        !anyUploading &&
        !!title &&
        (type === "TEXT" || type === "COMBO" || !!mediaUrl) &&
        (type !== "COMBO" || comboItems.length > 0);

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        try {
            await onSubmit({
                key,
                title,
                type,
                text: text || undefined,
                mediaUrl: mediaUrl || undefined,
                tags: parseTags(tagsInput),
                comboItems:
                    type === "COMBO"
                        ? comboItems.map(({ type, url, tagsInput }) => ({
                              type,
                              url,
                              tags: parseTags(tagsInput),
                          }))
                        : undefined,
            });
            // Reset
            setTitle("");
            setText("");
            setMediaUrl("");
            setTagsInput("");
            setComboItems([]);
            setType("TEXT");
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } finally {
            setSaving(false);
        }
    };

    const typeIcons: Record<string, React.ElementType> = {
        TEXT: FileText,
        IMAGE: ImageIcon,
        VIDEO: Video,
        AUDIO: Mic,
        COMBO: Layers,
    };

    return (
        <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Plus className="w-5 h-5 text-primary" />
                    Novo Template
                </CardTitle>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
                {/* Key + Título */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label className="font-semibold flex items-center gap-2">
                            Finalidade (Key)
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="w-3.5 h-3.5 text-slate-400" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    Identificador para o sistema disparar no
                                    evento correto.
                                </TooltipContent>
                            </Tooltip>
                        </Label>
                        <select
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {TEMPLATE_KEYS.map((k) => (
                                <option key={k} value={k}>
                                    {k}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label className="font-semibold">
                            Título do Template
                        </Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex: Boas-vindas Black Friday"
                            className="bg-slate-50/50 border-slate-200"
                        />
                    </div>
                </div>

                {/* Tipo de conteúdo */}
                <div className="space-y-3">
                    <Label className="font-semibold">Tipo de Conteúdo</Label>
                    <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100/50 rounded-lg w-fit border border-slate-200">
                        {MEDIA_TYPES.map((t) => {
                            const Icon = typeIcons[t];
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                        setType(t);
                                        setMediaUrl("");
                                        setComboItems([]);
                                        setMainUploading(false);
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                                        type === t
                                            ? "bg-white text-primary shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {t}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Texto */}
                <div className="space-y-2">
                    <Label className="font-semibold flex items-center gap-2">
                        Texto / Legenda
                        <span className="font-normal text-[10px] text-slate-400 uppercase tracking-wider">
                            {type === "TEXT" ? "(obrigatório)" : "(opcional)"}
                        </span>
                    </Label>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Digite sua mensagem aqui..."
                        rows={4}
                        className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    />
                </div>

                <div className="space-y-2">
                    <Label className="font-semibold">
                        Tags do Template
                    </Label>
                    <Input
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="Ex: previa, foto, video, vip, audio"
                        className="bg-slate-50/50 border-slate-200"
                    />
                    <p className="text-[11px] text-slate-400">
                        Separe por virgula. A Clara usa essas tags para escolher
                        o preview mais certo.
                    </p>
                </div>

                {/* Mídia única (IMAGE / VIDEO / AUDIO) */}
                {(type === "IMAGE" || type === "VIDEO" || type === "AUDIO") && (
                    <div className="space-y-3 p-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                        <Label className="font-semibold text-slate-700 flex items-center gap-2">
                            Arquivo de Mídia
                            {type === "AUDIO" && (
                                <span className="text-[10px] font-normal text-slate-400 bg-slate-200 rounded px-1.5 py-0.5">
                                    converte para OGG Opus automaticamente
                                </span>
                            )}
                            {type === "VIDEO" && (
                                <span className="text-[10px] font-normal text-slate-400 bg-slate-200 rounded px-1.5 py-0.5">
                                    comprime para H.264 720p automaticamente
                                </span>
                            )}
                        </Label>
                        <MediaUploader
                            accept={
                                type === "IMAGE"
                                    ? "image/*"
                                    : type === "VIDEO"
                                      ? "video/*"
                                      : "audio/*"
                            }
                            multiple={false}
                            currentUrl={mediaUrl}
                            onUploaded={(url) => setMediaUrl(url)}
                            onUploadingChange={setMainUploading}
                            label="Clique ou arraste o arquivo aqui"
                        />
                    </div>
                )}

                {/* COMBO */}
                {type === "COMBO" && (
                    <div className="space-y-4 border border-slate-200 rounded-lg p-5 bg-slate-50/30">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <Label className="font-bold text-slate-800 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-primary" />
                                    Elementos do Combo
                                </Label>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Selecione vários arquivos de uma vez. O tipo
                                    é detectado automaticamente e pode ser
                                    ajustado.
                                </p>
                            </div>
                            <Badge
                                variant="secondary"
                                className="shrink-0 bg-slate-100 text-slate-600 text-[10px]"
                            >
                                {comboItems.length} arquivo(s)
                            </Badge>
                        </div>

                        {/* Uploader multi-arquivo para COMBO */}
                        <MediaUploader
                            accept="image/*,video/*,audio/*"
                            multiple={true}
                            onUploaded={onComboUploaded}
                            onUploadingChange={setMainUploading}
                            label="Clique ou arraste múltiplos arquivos"
                        />

                        {/* Lista dos itens já carregados com tipo ajustável */}
                        {comboItems.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-200">
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                    Ordem e tipo dos arquivos
                                </p>
                                {comboItems.map((item, idx) => (
                                    <div
                                        key={item.localId}
                                        className="space-y-2 bg-white border border-slate-100 rounded-lg px-3 py-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                            <Badge
                                                variant="secondary"
                                                className="bg-slate-100 text-slate-500 font-mono text-[10px] h-5 w-5 flex items-center justify-center rounded-full shrink-0 p-0"
                                            >
                                                {idx + 1}
                                            </Badge>
                                            <span className="text-xs text-slate-600 truncate flex-1 font-mono">
                                                {
                                                    item.url
                                                        .split("/")
                                                        .pop()
                                                        ?.split("?")[0]
                                                }
                                            </span>
                                            <select
                                                value={item.type}
                                                onChange={(e) =>
                                                    updateComboType(
                                                        item.localId,
                                                        e.target.value,
                                                    )
                                                }
                                                className="h-7 px-2 bg-slate-50 border border-slate-200 rounded text-[11px] focus:outline-none shrink-0"
                                            >
                                                {["IMAGE", "VIDEO", "AUDIO"].map(
                                                    (t) => (
                                                        <option
                                                            key={t}
                                                            value={t}
                                                        >
                                                            {t}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    removeComboItem(
                                                        item.localId,
                                                    )
                                                }
                                                className="text-slate-300 hover:text-red-500 transition-colors shrink-0"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <Input
                                            value={item.tagsInput}
                                            onChange={(e) =>
                                                updateComboTags(
                                                    item.localId,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Tags da midia: previa, foto, close, audio, teaser"
                                            className="bg-slate-50/70 border-slate-200 text-xs"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Aviso global de upload ativo */}
                {anyUploading && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        Aguarde o processamento terminar antes de salvar…
                    </div>
                )}

                {/* Submit */}
                <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className={`w-full h-12 text-sm font-bold uppercase tracking-widest shadow-lg shadow-primary/20 transition-all ${
                        success
                            ? "bg-emerald-500 hover:bg-emerald-600"
                            : "bg-primary hover:bg-primary/90"
                    }`}
                >
                    {saving ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Salvando…
                        </span>
                    ) : anyUploading ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processando mídia…
                        </span>
                    ) : success ? (
                        <span className="flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Sucesso!
                        </span>
                    ) : (
                        "Salvar Template"
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}

function parseTags(value: string): string[] {
    const seen = new Set<string>();

    return value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => {
            if (!tag || seen.has(tag)) {
                return false;
            }

            seen.add(tag);
            return true;
        });
}
