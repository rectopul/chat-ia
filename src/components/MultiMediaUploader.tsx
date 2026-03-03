"use client";

import { useCallback, useRef, useState } from "react";
import { uploadFile } from "@/lib/upload-actions"; // ajuste o caminho

export type DetectedMediaType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

export interface MediaItem {
    id: string;
    url: string;
    type: DetectedMediaType;
    name: string;
    preview?: string; // object URL para preview local
    uploading?: boolean;
    error?: string;
}

interface MultiMediaUploaderProps {
    /** Valor inicial (edição de template existente) */
    defaultItems?: Omit<MediaItem, "preview" | "uploading" | "error">[];
    /** Chamado sempre que a lista muda, para o pai manter estado sincronizado */
    onChange?: (items: MediaItem[]) => void;
}

const ICONS: Record<DetectedMediaType, string> = {
    IMAGE: "🖼️",
    VIDEO: "🎬",
    AUDIO: "🎵",
    DOCUMENT: "📄",
};

function uid() {
    return Math.random().toString(36).slice(2, 9);
}

export function MultiMediaUploader({
    defaultItems = [],
    onChange,
}: MultiMediaUploaderProps) {
    const [items, setItems] = useState<MediaItem[]>(
        defaultItems.map((i) => ({ ...i, id: i.id ?? uid() })),
    );
    const [draggingOver, setDraggingOver] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const notify = (next: MediaItem[]) => {
        setItems(next);
        onChange?.(next);
    };

    // ── Upload de um File ────────────────────────────────────────────────────────
    const processFile = useCallback(
        async (file: File) => {
            const tempId = uid();
            const preview = file.type.startsWith("image/")
                ? URL.createObjectURL(file)
                : undefined;

            // Placeholder enquanto faz upload
            setItems((prev) => {
                const next = [
                    ...prev,
                    {
                        id: tempId,
                        url: "",
                        type: "DOCUMENT" as DetectedMediaType,
                        name: file.name,
                        preview,
                        uploading: true,
                    },
                ];
                return next;
            });

            try {
                const fd = new FormData();
                fd.append("file", file);
                const result = await uploadFile(fd);

                setItems((prev) => {
                    const next = prev.map((item) =>
                        item.id === tempId
                            ? {
                                  ...item,
                                  url: result.url,
                                  type: result.type,
                                  uploading: false,
                              }
                            : item,
                    );
                    onChange?.(next);
                    return next;
                });
            } catch (e: any) {
                setItems((prev) => {
                    const next = prev.map((item) =>
                        item.id === tempId
                            ? {
                                  ...item,
                                  uploading: false,
                                  error: e.message ?? "Erro",
                              }
                            : item,
                    );
                    return next;
                });
            }
        },
        [onChange],
    );

    const processFiles = useCallback(
        (files: FileList | File[]) => {
            Array.from(files).forEach(processFile);
        },
        [processFile],
    );

    // ── Drag & Drop na zona de upload ───────────────────────────────────────────
    const onDropZone = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDraggingOver(false);
            if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
        },
        [processFiles],
    );

    // ── Reordenação por drag dos itens ──────────────────────────────────────────
    const onItemDragStart = (index: number) => setDraggedIndex(index);
    const onItemDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };
    const onItemDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) return;
        setItems((prev) => {
            const next = [...prev];
            const [moved] = next.splice(draggedIndex, 1);
            next.splice(targetIndex, 0, moved);
            onChange?.(next);
            return next;
        });
        setDraggedIndex(null);
        setDragOverIndex(null);
    };
    const onItemDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const removeItem = (id: string) => {
        notify(items.filter((i) => i.id !== id));
    };

    return (
        <div className="space-y-3">
            {/* Hidden inputs — um por item — para o server action do formulário pai */}
            {items
                .filter((i) => i.url && !i.uploading && !i.error)
                .map((item, idx) => (
                    <input
                        key={item.id}
                        type="hidden"
                        name={`media[${idx}][url]`}
                        value={item.url}
                    />
                ))}
            {items
                .filter((i) => i.url && !i.uploading && !i.error)
                .map((item, idx) => (
                    <input
                        key={`t-${item.id}`}
                        type="hidden"
                        name={`media[${idx}][type]`}
                        value={item.type}
                    />
                ))}
            {items
                .filter((i) => i.url && !i.uploading && !i.error)
                .map((item, idx) => (
                    <input
                        key={`o-${item.id}`}
                        type="hidden"
                        name={`media[${idx}][order]`}
                        value={idx}
                    />
                ))}

            {/* Zona de drop */}
            <label
                onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingOver(true);
                }}
                onDragLeave={() => setDraggingOver(false)}
                onDrop={onDropZone}
                className={`
          flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer
          transition-all duration-200
          ${
              draggingOver
                  ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
                  : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400"
          }
        `}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) =>
                        e.target.files && processFiles(e.target.files)
                    }
                />
                <div className="flex flex-col items-center gap-1 pointer-events-none select-none">
                    <div className="flex gap-1 text-xl">🖼️ 🎬 🎵 📄</div>
                    <span className="text-sm font-medium text-gray-600">
                        Arraste arquivos ou{" "}
                        <span className="text-indigo-600 underline">
                            clique para selecionar
                        </span>
                    </span>
                    <span className="text-xs text-gray-400">
                        Imagens, vídeos, áudios e documentos — múltiplos
                        permitidos
                    </span>
                </div>
            </label>

            {/* Lista de itens */}
            {items.length > 0 && (
                <ul className="space-y-2">
                    {items.map((item, index) => (
                        <li
                            key={item.id}
                            draggable={!item.uploading}
                            onDragStart={() => onItemDragStart(index)}
                            onDragOver={(e) => onItemDragOver(e, index)}
                            onDrop={(e) => onItemDrop(e, index)}
                            onDragEnd={onItemDragEnd}
                            className={`
                flex items-center gap-3 p-2 rounded-lg border bg-white transition-all duration-150
                ${dragOverIndex === index ? "border-indigo-400 bg-indigo-50 scale-[1.01]" : "border-gray-200"}
                ${item.uploading ? "opacity-60" : "cursor-grab active:cursor-grabbing"}
              `}
                        >
                            {/* Grip */}
                            <span className="text-gray-300 select-none text-lg leading-none">
                                ⠿
                            </span>

                            {/* Preview ou ícone */}
                            <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-gray-100 flex items-center justify-center">
                                {item.preview ? (
                                    <img
                                        src={item.preview}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : item.type === "AUDIO" ? (
                                    <span className="text-2xl">🎵</span>
                                ) : (
                                    <span className="text-2xl">
                                        {ICONS[item.type] ?? "📄"}
                                    </span>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                    {item.name}
                                </p>
                                {item.uploading ? (
                                    <p className="text-xs text-indigo-500 flex items-center gap-1">
                                        <svg
                                            className="animate-spin h-3 w-3"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            />
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8v8H4z"
                                            />
                                        </svg>
                                        Enviando...
                                    </p>
                                ) : item.error ? (
                                    <p className="text-xs text-red-500">
                                        {item.error}
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-400">
                                        {item.type}
                                    </p>
                                )}
                            </div>

                            {/* Número de ordem */}
                            {!item.uploading && !item.error && (
                                <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                    #{index + 1}
                                </span>
                            )}

                            {/* Remover */}
                            <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                                title="Remover"
                            >
                                <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {items.length > 1 && (
                <p className="text-xs text-gray-400 text-center">
                    Arraste os itens para reordenar • a ordem define a sequência
                    de envio no Telegram
                </p>
            )}
        </div>
    );
}
