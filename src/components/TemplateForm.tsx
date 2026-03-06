"use client";
// components/TemplateForm.tsx
// Formulário completo para criação de templates com upload via Vercel Blob.

import { useState } from "react";
import { MediaUploader } from "./MediaUploader";

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

    return (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 space-y-5">
            <h3 className="text-lg font-bold text-gray-800">Novo Template</h3>

            {/* Linha 1: Key + Título */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                        Chave
                    </label>
                    <select
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="w-full p-2 border rounded-lg text-sm"
                    >
                        {TEMPLATE_KEYS.map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                        Título
                    </label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Boas-vindas com imagem"
                        className="w-full p-2 border rounded-lg text-sm"
                    />
                </div>
            </div>

            {/* Tipo */}
            <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                    Tipo de Mídia
                </label>
                <div className="flex flex-wrap gap-2">
                    {MEDIA_TYPES.map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => {
                                setType(t);
                                setMediaUrl("");
                                setComboItems([]);
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                                type === t
                                    ? "bg-indigo-600 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Texto */}
            <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                    Texto{" "}
                    <span className="text-gray-400 font-normal text-xs">
                        {type === "TEXT"
                            ? "(obrigatório)"
                            : "(opcional — legenda)"}
                    </span>
                </label>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Digite o texto ou legenda..."
                    rows={3}
                    className="w-full p-2 border rounded-lg text-sm resize-none"
                />
            </div>

            {/* Upload de mídia única (IMAGE / VIDEO / AUDIO) */}
            {(type === "IMAGE" || type === "VIDEO" || type === "AUDIO") && (
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                        Arquivo de Mídia
                    </label>
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

            {/* COMBO: múltiplos arquivos */}
            {type === "COMBO" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">
                            Arquivos do Combo
                        </label>
                        <button
                            type="button"
                            onClick={addComboItem}
                            className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                            + Adicionar arquivo
                        </button>
                    </div>

                    {comboItems.length === 0 && (
                        <p className="text-xs text-gray-400 italic">
                            Clique em "Adicionar arquivo" para montar o combo.
                        </p>
                    )}

                    {comboItems.map((item, index) => (
                        <div
                            key={item.localId}
                            className="flex gap-3 items-start p-3 border rounded-lg bg-gray-50"
                        >
                            <span className="text-xs font-mono text-gray-400 mt-2 w-4 shrink-0">
                                {index + 1}
                            </span>
                            <div className="flex-1 space-y-2">
                                <select
                                    value={item.type}
                                    onChange={(e) =>
                                        updateComboItem(item.localId, {
                                            type: e.target.value,
                                            url: "",
                                        })
                                    }
                                    className="w-full p-1.5 border rounded-md text-xs"
                                >
                                    {["IMAGE", "VIDEO", "AUDIO"].map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
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
                            <button
                                type="button"
                                onClick={() => removeComboItem(item.localId)}
                                className="text-red-400 hover:text-red-600 mt-1 text-lg leading-none"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Submit */}
            <button
                type="button"
                onClick={handleSubmit}
                disabled={
                    saving ||
                    !title ||
                    (type !== "TEXT" && type !== "COMBO" && !mediaUrl) ||
                    (type === "COMBO" && comboItems.some((i) => !i.url))
                }
                className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition text-sm"
            >
                {saving
                    ? "Salvando..."
                    : success
                      ? "✓ Template salvo!"
                      : "Salvar Template"}
            </button>
        </div>
    );
}
