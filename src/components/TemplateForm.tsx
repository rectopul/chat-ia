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
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TEMPLATE_KEYS = ["WELCOME", "DONT_SELL", "SUBSCRIBER_CONTENT", "TIMED"];
const MEDIA_TYPES = ["TEXT", "IMAGE", "VIDEO", "AUDIO", "COMBO"];

interface ComboItem {
    type: string;
    url: string;
    localId: string;
}

interface Props {
    onSubmit: (data: {
        key: string;
        title: string;
        type: string;
        text?: string;
        mediaUrl?: string;
        comboItems?: { type: string; url: string }[];
    }) => Promise<void>;
}

export function TemplateForm({ onSubmit }: Props) {
    const [key, setKey] = useState(TEMPLATE_KEYS[0]);
    const [title, setTitle] = useState("");
    const [type, setType] = useState("TEXT");
    const [text, setText] = useState("");
    const [mediaUrl, setMediaUrl] = useState("");
    const [comboItems, setComboItems] = useState<ComboItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    const addComboItem = () => {
        setComboItems((prev) => [
            ...prev,
            { type: "IMAGE", url: "", localId: crypto.randomUUID() },
        ]);
    };

    const removeComboItem = (localId: string) => {
        setComboItems((prev) => prev.filter((i) => i.localId !== localId));
    };

    const updateComboItem = (localId: string, patch: Partial<ComboItem>) => {
        setComboItems((prev) =>
            prev.map((i) => (i.localId === localId ? { ...i, ...patch } : i)),
        );
    };

    const handleSubmit = async () => {
        if (!title || !key) return;
        if (type !== "TEXT" && type !== "COMBO" && !mediaUrl) return;
        if (type === "COMBO" && comboItems.some((i) => !i.url)) return;

        setSaving(true);
        try {
            await onSubmit({
                key,
                title,
                type,
                text: text || undefined,
                mediaUrl: mediaUrl || undefined,
                comboItems:
                    type === "COMBO"
                        ? comboItems.map(({ type, url }) => ({ type, url }))
                        : undefined,
            });

            // Reset
            setTitle("");
            setText("");
            setMediaUrl("");
            setComboItems([]);
            setType("TEXT");
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } finally {
            setSaving(false);
        }
    };

    const typeIcons: Record<string, any> = {
        TEXT: FileText,
        IMAGE: ImageIcon,
        VIDEO: Video,
        AUDIO: Mic,
        COMBO: Layers
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label className="font-semibold flex items-center gap-2">
                            Finalidade (Key)
                            <Tooltip>
                                <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                                <TooltipContent>Identificador para o sistema disparar no evento correto.</TooltipContent>
                            </Tooltip>
                        </Label>
                        <select
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            {TEMPLATE_KEYS.map((k) => (
                                <option key={k} value={k}>{k}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label className="font-semibold">Título do Template</Label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Ex: Boas-vindas Black Friday"
                            className="bg-slate-50/50 border-slate-200"
                        />
                    </div>
                </div>

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
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${
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

                {(type === "IMAGE" || type === "VIDEO" || type === "AUDIO") && (
                    <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-lg border-dashed">
                        <Label className="font-semibold text-slate-700">Arquivo de Mídia</Label>
                        <MediaUploader
                            accept={
                                type === "IMAGE"
                                    ? "image/*"
                                    : type === "VIDEO"
                                      ? "video/*"
                                      : "audio/*"
                            }
                            currentUrl={mediaUrl}
                            onUploaded={(url) => setMediaUrl(url)}
                        />
                    </div>
                )}

                {type === "COMBO" && (
                    <div className="space-y-4 border border-slate-200 rounded-lg p-5 bg-slate-50/30">
                        <div className="flex items-center justify-between">
                            <Label className="font-bold text-slate-800 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-primary" />
                                Elementos do Combo
                            </Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addComboItem}
                                className="h-8 text-[10px] font-bold uppercase tracking-wider bg-white border-slate-200"
                            >
                                <Plus className="w-3 h-3 mr-1" />
                                Novo Arquivo
                            </Button>
                        </div>

                        {comboItems.length === 0 && (
                            <div className="text-center py-8 border border-dashed border-slate-300 rounded-md bg-white">
                                <p className="text-xs text-slate-400">Nenhum elemento adicionado ao combo.</p>
                            </div>
                        )}

                        <div className="space-y-3">
                            {comboItems.map((item, index) => (
                                <div
                                    key={item.localId}
                                    className="flex gap-4 items-start p-4 border border-slate-200 rounded-xl bg-white shadow-sm transition-all"
                                >
                                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-mono text-[10px] h-6 w-6 flex items-center justify-center rounded-full shrink-0">
                                        {index + 1}
                                    </Badge>
                                    <div className="flex-1 space-y-3">
                                        <select
                                            value={item.type}
                                            onChange={(e) =>
                                                updateComboItem(item.localId, {
                                                    type: e.target.value,
                                                    url: "",
                                                })
                                            }
                                            className="w-full h-8 px-2 bg-slate-50/50 border border-slate-200 rounded text-xs focus:outline-none"
                                        >
                                            {["IMAGE", "VIDEO", "AUDIO"].map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <MediaUploader
                                            accept={
                                                item.type === "IMAGE"
                                                    ? "image/*"
                                                    : item.type === "VIDEO"
                                                      ? "video/*"
                                                      : "audio/*"
                                            }
                                            currentUrl={item.url}
                                            onUploaded={(url) =>
                                                updateComboItem(item.localId, { url })
                                            }
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeComboItem(item.localId)}
                                        className="text-slate-300 hover:text-red-500"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Button
                    onClick={handleSubmit}
                    disabled={
                        saving ||
                        !title ||
                        (type !== "TEXT" && type !== "COMBO" && !mediaUrl) ||
                        (type === "COMBO" && comboItems.some((i) => !i.url))
                    }
                    className={`w-full h-12 text-sm font-bold uppercase tracking-widest shadow-lg shadow-primary/20 transition-all ${
                        success ? "bg-emerald-500 hover:bg-emerald-600" : "bg-primary hover:bg-primary/90"
                    }`}
                >
                    {saving ? (
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Salvando...
                        </div>
                    ) : success ? (
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Sucesso!
                        </div>
                    ) : (
                        "Salvar Template"
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
