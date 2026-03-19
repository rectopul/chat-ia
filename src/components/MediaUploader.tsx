"use client";
// components/MediaUploader.tsx

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Upload,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    X,
    ArrowRight,
    ImageIcon,
    Film,
    Music,
    FileIcon,
    Trash2,
} from "lucide-react";
import { generateId } from "@/lib/services";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilePhase =
    | { phase: "uploading"; progress: number }
    | { phase: "processing"; hint: string }
    | {
          phase: "done";
          url: string;
          processingNote: string;
          originalSize: number;
          finalSize: number;
      }
    | { phase: "error"; message: string }
    | { phase: "deleting" };

interface FileEntry {
    id: string;
    file: File;
    previewUrl: string | null;
    status: FilePhase;
}

interface UploadResponse {
    url: string;
    processingNote?: string;
    originalSize?: number;
    finalSize?: number;
    error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (!bytes) return "0 B";
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function getProcessingHint(name: string): string {
    const n = name.toLowerCase();
    if (/\.(mp3|wav|m4a|aac|flac)$/.test(n)) return "Convertendo OGG Opus…";
    if (/\.(mp4|mov|avi|mkv|webm)$/.test(n)) return "Comprimindo H.264…";
    return "Processando…";
}

async function deleteFromBlob(url: string): Promise<void> {
    const res = await fetch("/api/upload", {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({ url }),
    });

    if (!res.ok) {
        let message = `Erro ${res.status}`;
        try {
            const data = await res.json();
            message = data.error ?? message;
        } catch {
            // ignora erro no parse da resposta de erro
        }
        throw new Error(message);
    }
}

function FileTypeIcon({ file }: { file: File }) {
    if (file.type.startsWith("image/"))
        return <ImageIcon className="w-5 h-5 text-blue-400" />;
    if (file.type.startsWith("video/"))
        return <Film className="w-5 h-5 text-purple-400" />;
    if (file.type.startsWith("audio/"))
        return <Music className="w-5 h-5 text-emerald-400" />;
    return <FileIcon className="w-5 h-5 text-slate-400" />;
}

// ─── File Card ────────────────────────────────────────────────────────────────

function FileCard({
    entry,
    onRemove,
}: {
    entry: FileEntry;
    onRemove: (id: string) => void;
}) {
    const { status, file, previewUrl } = entry;
    const isDone = status.phase === "done";
    const isError = status.phase === "error";
    const isDeleting = status.phase === "deleting";
    const isActive =
        status.phase === "uploading" || status.phase === "processing";
    const isBlocked = isActive || isDeleting;

    return (
        <div
            className={`relative flex flex-col rounded-xl border overflow-hidden transition-all bg-white
            ${isDone ? "border-emerald-200 shadow-sm shadow-emerald-100" : ""}
            ${isError ? "border-red-200 shadow-sm shadow-red-100" : ""}
            ${isDeleting ? "border-slate-200 opacity-60" : ""}
            ${isActive ? "border-primary/30 shadow-sm shadow-primary/10" : ""}
            ${!isDone && !isError && !isActive && !isDeleting ? "border-slate-200" : ""}
        `}
        >
            {/* Preview */}
            <div className="relative bg-slate-50 h-32 flex items-center justify-center overflow-hidden">
                {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={previewUrl}
                        alt={file.name}
                        className="w-full h-full object-cover"
                    />
                ) : isDone &&
                  (status as any).url?.match(/\.(jpg|jpeg|png|gif|webp)/i) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={(status as any).url}
                        alt={file.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-1.5 text-slate-300">
                        <FileTypeIcon file={file} />
                        <span className="text-[10px] font-mono uppercase">
                            {file.name.split(".").pop()}
                        </span>
                    </div>
                )}

                {/* Overlays de estado */}
                {status.phase === "processing" && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                        <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                        <span className="text-[10px] text-primary font-medium text-center px-2">
                            {status.hint}
                        </span>
                    </div>
                )}

                {isDeleting && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
                        <span className="text-[10px] text-red-500 font-medium">
                            Removendo do storage…
                        </span>
                    </div>
                )}

                {/* Badges de status */}
                {isDone && (
                    <div className="absolute top-1.5 left-1.5 bg-emerald-500 text-white rounded-full p-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                )}
                {isError && (
                    <div className="absolute top-1.5 left-1.5 bg-red-500 text-white rounded-full p-0.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                )}

                {/* Botão de remoção */}
                {!isBlocked && (
                    <button
                        type="button"
                        onClick={() => onRemove(entry.id)}
                        title={
                            isDone
                                ? "Remover do storage e da lista"
                                : "Remover da lista"
                        }
                        className={`absolute top-1.5 right-1.5 text-white rounded-full p-0.5 transition-colors
                            ${
                                isDone
                                    ? "bg-red-400/80 hover:bg-red-600"
                                    : "bg-black/40 hover:bg-black/70"
                            }`}
                    >
                        {isDone ? (
                            <Trash2 className="w-3.5 h-3.5" />
                        ) : (
                            <X className="w-3.5 h-3.5" />
                        )}
                    </button>
                )}
            </div>

            {/* Info */}
            <div className="p-2 space-y-1.5">
                <p
                    className="text-[11px] text-slate-600 font-medium truncate"
                    title={file.name}
                >
                    {file.name}
                </p>

                {status.phase === "uploading" && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-slate-400">
                            <span className="flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                Enviando
                            </span>
                            <span className="font-mono font-semibold text-primary">
                                {status.progress}%
                            </span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-150"
                                style={{ width: `${status.progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {status.phase === "processing" && (
                    <p className="text-[10px] text-primary flex items-center gap-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        {status.hint}
                    </p>
                )}

                {isDone && (
                    <div className="text-[10px] text-emerald-600 space-y-0.5">
                        {status.processingNote && (
                            <p className="truncate">{status.processingNote}</p>
                        )}
                        {status.originalSize > 0 &&
                            status.finalSize > 0 &&
                            status.originalSize !== status.finalSize && (
                                <p className="flex items-center gap-0.5 text-emerald-500 font-medium">
                                    {formatBytes(status.originalSize)}
                                    <ArrowRight className="w-2.5 h-2.5" />
                                    {formatBytes(status.finalSize)}
                                    <span className="text-emerald-700">
                                        (-
                                        {(
                                            ((status.originalSize -
                                                status.finalSize) /
                                                status.originalSize) *
                                            100
                                        ).toFixed(0)}
                                        %)
                                    </span>
                                </p>
                            )}
                    </div>
                )}

                {isError && (
                    <p className="text-[10px] text-red-500 truncate">
                        {status.message}
                    </p>
                )}

                {isDeleting && (
                    <p className="text-[10px] text-slate-400 italic">
                        Removendo…
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    accept?: string;
    multiple?: boolean;
    onUploaded: (url: string) => void;
    onRemoved?: (url: string) => void; // chamado após remoção do blob
    onUploadingChange?: (v: boolean) => void;
    currentUrl?: string;
    label?: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MediaUploader({
    accept = "image/*,video/*,audio/*",
    multiple = true,
    onUploaded,
    onRemoved,
    onUploadingChange,
    currentUrl,
    label = "Clique ou arraste arquivos aqui",
}: Props) {
    const [entries, setEntries] = useState<FileEntry[]>(() => {
        if (!currentUrl) return [];
        return [
            {
                id: generateId(),
                file: new File([], currentUrl.split("/").pop() ?? "file"),
                previewUrl: currentUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)
                    ? currentUrl
                    : null,
                status: {
                    phase: "done",
                    url: currentUrl,
                    processingNote: "",
                    originalSize: 0,
                    finalSize: 0,
                },
            },
        ];
    });

    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const anyActive = entries.some(
        (e) =>
            e.status.phase === "uploading" ||
            e.status.phase === "processing" ||
            e.status.phase === "deleting",
    );

    // Notifica o pai sobre mudança de estado de upload via useEffect
    // para evitar "setState durante render" quando entries muda
    useEffect(() => {
        onUploadingChange?.(anyActive);
    }, [anyActive, onUploadingChange]);

    const updateEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
        setEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        );
    }, []);

    // ── Upload ─────────────────────────────────────────────────────────────

    const uploadFile = useCallback(
        (file: File) => {
            const id = generateId();
            const previewUrl = file.type.startsWith("image/")
                ? URL.createObjectURL(file)
                : null;

            setEntries((prev) => [
                ...prev,
                {
                    id,
                    file,
                    previewUrl,
                    status: { phase: "uploading" as const, progress: 0 },
                },
            ]);

            const fd = new FormData();
            fd.append("file", file);
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener("progress", (e) => {
                if (!e.lengthComputable) return;
                const pct = Math.round((e.loaded / e.total) * 100);
                updateEntry(id, {
                    status:
                        pct < 100
                            ? { phase: "uploading", progress: pct }
                            : {
                                  phase: "processing",
                                  hint: getProcessingHint(file.name),
                              },
                });
            });

            xhr.addEventListener("load", () => {
                try {
                    const data: UploadResponse = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300 && data.url) {
                        updateEntry(id, {
                            status: {
                                phase: "done",
                                url: data.url,
                                processingNote: data.processingNote ?? "",
                                originalSize: data.originalSize ?? 0,
                                finalSize: data.finalSize ?? 0,
                            },
                        });
                        onUploaded(data.url);
                    } else {
                        updateEntry(id, {
                            status: {
                                phase: "error",
                                message: data.error ?? `Erro ${xhr.status}`,
                            },
                        });
                    }
                } catch {
                    updateEntry(id, {
                        status: {
                            phase: "error",
                            message: "Resposta inválida.",
                        },
                    });
                }
            });

            xhr.addEventListener("error", () => {
                updateEntry(id, {
                    status: { phase: "error", message: "Falha na conexão." },
                });
            });

            xhr.open("POST", "/api/upload");
            xhr.send(fd);
        },
        [onUploaded, updateEntry],
    );

    // ── Remove ─────────────────────────────────────────────────────────────

    const removeEntry = useCallback(
        async (id: string) => {
            const entry = entries.find((e) => e.id === id);
            if (!entry) return;

            const isDone = entry.status.phase === "done";

            if (isDone) {
                // Marca como "deletando" para mostrar spinner
                updateEntry(id, { status: { phase: "deleting" } });

                try {
                    await deleteFromBlob((entry.status as any).url);
                    onRemoved?.((entry.status as any).url);
                } catch (err: any) {
                    console.error(
                        "[MediaUploader] Falha ao deletar blob:",
                        err?.message,
                    );
                    // Mesmo com erro, remove da UI — arquivo órfão no storage
                    // é preferível a UX quebrada
                }
            }

            // Remove o previewUrl para liberar memória
            if (entry.previewUrl?.startsWith("blob:")) {
                URL.revokeObjectURL(entry.previewUrl);
            }

            setEntries((prev) => prev.filter((e) => e.id !== id));
        },
        [entries, updateEntry, onRemoved],
    );

    // ── Drag & Drop ────────────────────────────────────────────────────────

    const handleFiles = useCallback(
        (files: FileList | File[]) => Array.from(files).forEach(uploadFile),
        [uploadFile],
    );

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const onDragLeave = () => setIsDragging(false);
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const doneCount = entries.filter((e) => e.status.phase === "done").length;
    const errorCount = entries.filter((e) => e.status.phase === "error").length;
    const activeCount = entries.filter(
        (e) =>
            e.status.phase === "uploading" || e.status.phase === "processing",
    ).length;

    return (
        <div className="flex flex-col gap-3">
            {/* Drop zone */}
            <div
                onClick={() => !anyActive && inputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-6 transition-all
                    ${isDragging ? "border-primary bg-primary/5 scale-[1.01]" : ""}
                    ${anyActive && !isDragging ? "border-primary/30 bg-primary/3 cursor-default" : ""}
                    ${!isDragging && !anyActive ? "border-slate-200 hover:border-primary/40 hover:bg-slate-50/60 cursor-pointer" : ""}
                `}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple={multiple}
                    className="hidden"
                    onChange={(e) => {
                        if (e.target.files) handleFiles(e.target.files);
                        e.target.value = "";
                    }}
                />

                <div
                    className={`flex flex-col items-center gap-2 transition-colors ${isDragging ? "text-primary" : "text-slate-400"}`}
                >
                    <div
                        className={`p-3 rounded-full transition-colors ${isDragging ? "bg-primary/10" : "bg-slate-100"}`}
                    >
                        <Upload className="w-5 h-5" />
                    </div>
                    <div className="text-center">
                        <p
                            className={`text-sm font-medium transition-colors ${isDragging ? "text-primary" : "text-slate-600"}`}
                        >
                            {isDragging ? "Solte os arquivos aqui" : label}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {multiple
                                ? "Selecione vários arquivos de uma vez"
                                : "Selecione um arquivo"}
                            {" · "}
                            {accept
                                .replace(/\*/g, "qualquer")
                                .replace(/,/g, ", ")}
                        </p>
                    </div>
                </div>

                {activeCount > 0 && (
                    <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {activeCount} arquivo(s) sendo processado(s)…
                    </div>
                )}
            </div>

            {/* Grade de arquivos */}
            {entries.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {entries.map((entry) => (
                        <FileCard
                            key={entry.id}
                            entry={entry}
                            onRemove={removeEntry}
                        />
                    ))}
                </div>
            )}

            {/* Rodapé de resumo */}
            {entries.length > 0 && !anyActive && (
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <span>
                        <span className="text-emerald-600 font-semibold">
                            {doneCount}
                        </span>
                        /{entries.length} concluídos
                        {errorCount > 0 && (
                            <span className="text-red-500 ml-2">
                                · {errorCount} com erro
                            </span>
                        )}
                    </span>
                    {errorCount > 0 && (
                        <button
                            type="button"
                            onClick={() =>
                                setEntries((prev) =>
                                    prev.filter(
                                        (e) => e.status.phase !== "error",
                                    ),
                                )
                            }
                            className="text-red-400 hover:text-red-600 hover:underline transition-colors"
                        >
                            Limpar erros
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
