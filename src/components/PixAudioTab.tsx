"use client";

import axios from "axios";
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PixAudioConfig {
    id: string;
    audioUrl: string;
    fileName: string;
    isActive: boolean;
    updatedAt: string;
}

const BOT_ID = "cmmjwq1960002j0vkz25ixgnl"; // substitua pelo botId real do seu contexto

const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

const ACCEPTED = [
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/mp4",
    "audio/aac",
    "audio/flac",
];
const ACCEPTED_EXT = ".mp3,.ogg,.wav,.m4a,.aac,.flac";

// ─────────────────────────────────────────────────────────────────────────────
export function PixAudioTab() {
    const [config, setConfig] = useState<PixAudioConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [toggling, setToggling] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Drag state
    const [isDragging, setIsDragging] = useState(false);
    const [dragFile, setDragFile] = useState<File | null>(null);
    const dropRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Audio player
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        fetch(`/api/pix-audio?botId=${BOT_ID}`)
            .then((r) => r.json())
            .then((data) => setConfig(data ?? null))
            .finally(() => setLoading(false));
    }, []);

    const flash = (msg: string, isError = false) => {
        if (isError) setError(msg);
        else setSuccess(msg);
        setTimeout(() => {
            setError("");
            setSuccess("");
        }, 4000);
    };

    // ── Drag & Drop handlers ──────────────────────────────────────────────────
    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);

        const file = e.dataTransfer.items?.[0];
        if (file && file.kind === "file") {
            setDragFile(null); // preview só no drop
        }
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        // Só sai se realmente saiu do elemento raiz
        if (
            dropRef.current &&
            !dropRef.current.contains(e.relatedTarget as Node)
        ) {
            setIsDragging(false);
        }
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        handleFile(file);
    }, []);

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = ""; // reset input
    };

    // ── Upload ────────────────────────────────────────────────────────────────
    const handleFile = async (file: File) => {
        if (!ACCEPTED.includes(file.type)) {
            flash(
                "Formato inválido. Use MP3, OGG, WAV, M4A, AAC ou FLAC.",
                true,
            );
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            flash("Arquivo muito grande. Máximo 20MB.", true);
            return;
        }

        setDragFile(file);
        setUploading(true);
        setUploadProgress(0);
        setError("");

        // Simula progresso enquanto faz o upload real
        const progressInterval = setInterval(() => {
            setUploadProgress((p) => Math.min(p + Math.random() * 15, 85));
        }, 200);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("botId", BOT_ID);

            const res = await fetch("/api/pix-audio/upload", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setUploadProgress(100);
            await new Promise((r) => setTimeout(r, 400));

            setConfig(data);
            setDragFile(null);
            flash("Áudio enviado com sucesso!");
        } catch (e: any) {
            flash(e.message ?? "Erro no upload.", true);
            setDragFile(null);
        } finally {
            clearInterval(progressInterval);
            setUploading(false);
            setUploadProgress(0);
        }
    };

    // ── Toggle / Delete ───────────────────────────────────────────────────────
    const handleToggle = async () => {
        if (!config) return;
        setToggling(true);
        try {
            const res = await fetch("/api/pix-audio", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    botId: BOT_ID,
                    isActive: !config.isActive,
                }),
            });
            const data = await res.json();
            setConfig(data);
            flash(`Áudio ${data.isActive ? "ativado" : "desativado"}.`);
        } catch {
            flash("Erro ao alterar status.", true);
        } finally {
            setToggling(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Remover o áudio configurado?")) return;
        setDeleting(true);
        setPlaying(false);
        try {
            await fetch(`/api/pix-audio?botId=${BOT_ID}`, { method: "DELETE" });
            setConfig(null);
            flash("Áudio removido.");
        } catch {
            flash("Erro ao remover.", true);
        } finally {
            setDeleting(false);
        }
    };

    // ── Audio player ──────────────────────────────────────────────────────────
    const togglePlay = () => {
        if (!audioRef.current) return;
        if (playing) {
            audioRef.current.pause();
            setPlaying(false);
        } else {
            audioRef.current.play();
            setPlaying(true);
        }
    };

    const onTimeUpdate = () => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    };
    const onLoadedMetadata = () => {
        if (audioRef.current) setDuration(audioRef.current.duration);
    };
    const onEnded = () => {
        setPlaying(false);
        setCurrentTime(0);
    };
    const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const t = parseFloat(e.target.value);
        if (audioRef.current) audioRef.current.currentTime = t;
        setCurrentTime(t);
    };

    const fmtTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60)
            .toString()
            .padStart(2, "0");
        return `${m}:${sec}`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-white/10 border-t-violet-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Info banner */}
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-300/80 leading-relaxed">
                🎙 Este áudio é enviado automaticamente ao cliente após a
                geração do PIX, com instruções de pagamento.
            </div>

            {/* Áudio atual */}
            {config && (
                <div className="rounded-xl border border-white/8 bg-[#111118] overflow-hidden">
                    {/* Cabeçalho */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/6">
                        <div className="flex items-center gap-2.5">
                            <div
                                className={`w-1.5 h-1.5 rounded-full ${config.isActive ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-white/20"}`}
                            />
                            <span className="text-sm font-medium truncate max-w-[260px]">
                                {config.fileName}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleToggle}
                                disabled={toggling}
                                className={`px-2.5 py-1 rounded-md border text-xs transition ${
                                    config.isActive
                                        ? "border-red-500/25 text-red-400/80 hover:bg-red-500/8"
                                        : "border-emerald-500/25 text-emerald-400/80 hover:bg-emerald-500/8"
                                }`}
                            >
                                {toggling
                                    ? "..."
                                    : config.isActive
                                      ? "Desativar"
                                      : "Ativar"}
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="px-2.5 py-1 rounded-md border border-white/8 text-xs text-white/30 hover:text-red-400 hover:border-red-500/25 transition"
                            >
                                {deleting ? "..." : "✕ Remover"}
                            </button>
                        </div>
                    </div>

                    {/* Player */}
                    <div className="px-5 py-4 space-y-3">
                        <audio
                            ref={audioRef}
                            src={config.audioUrl}
                            onTimeUpdate={onTimeUpdate}
                            onLoadedMetadata={onLoadedMetadata}
                            onEnded={onEnded}
                            preload="metadata"
                        />

                        {/* Waveform decorativa + controles */}
                        <div className="flex items-center gap-4">
                            {/* Play button */}
                            <button
                                onClick={togglePlay}
                                className="w-9 h-9 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition flex-shrink-0 shadow-[0_0_16px_rgba(124,58,237,0.4)]"
                            >
                                {playing ? (
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 14 14"
                                        fill="white"
                                    >
                                        <rect
                                            x="2"
                                            y="1"
                                            width="4"
                                            height="12"
                                            rx="1"
                                        />
                                        <rect
                                            x="8"
                                            y="1"
                                            width="4"
                                            height="12"
                                            rx="1"
                                        />
                                    </svg>
                                ) : (
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 14 14"
                                        fill="white"
                                    >
                                        <path d="M3 1.5l9 5.5-9 5.5V1.5z" />
                                    </svg>
                                )}
                            </button>

                            {/* Progress */}
                            <div className="flex-1 space-y-1">
                                <input
                                    type="range"
                                    min={0}
                                    max={duration || 100}
                                    value={currentTime}
                                    onChange={onSeek}
                                    className="w-full h-1 accent-violet-500 cursor-pointer"
                                    style={{
                                        background: `linear-gradient(to right, #7c3aed ${duration ? (currentTime / duration) * 100 : 0}%, rgba(255,255,255,0.1) 0%)`,
                                    }}
                                />
                                <div className="flex justify-between text-[10px] text-white/30 font-mono">
                                    <span>{fmtTime(currentTime)}</span>
                                    <span>
                                        {duration ? fmtTime(duration) : "--:--"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px] text-white/25">
                            Atualizado em {fmtDate(config.updatedAt)}
                        </p>
                    </div>
                </div>
            )}

            {/* Drag & Drop zone */}
            <div
                ref={dropRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !uploading && inputRef.current?.click()}
                className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer select-none overflow-hidden
          ${
              isDragging
                  ? "border-violet-500 bg-violet-500/8 scale-[1.01]"
                  : "border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/3"
          }
          ${uploading ? "pointer-events-none" : ""}
        `}
                style={{ transition: "all 0.2s ease" }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_EXT}
                    onChange={onInputChange}
                    className="hidden"
                />

                <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
                    {uploading ? (
                        <>
                            {/* Upload progress */}
                            <div className="w-14 h-14 rounded-full border-2 border-white/10 flex items-center justify-center relative">
                                <svg
                                    className="absolute inset-0 w-full h-full -rotate-90"
                                    viewBox="0 0 56 56"
                                >
                                    <circle
                                        cx="28"
                                        cy="28"
                                        r="26"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.05)"
                                        strokeWidth="2"
                                    />
                                    <circle
                                        cx="28"
                                        cy="28"
                                        r="26"
                                        fill="none"
                                        stroke="#7c3aed"
                                        strokeWidth="2"
                                        strokeDasharray={`${2 * Math.PI * 26}`}
                                        strokeDashoffset={`${2 * Math.PI * 26 * (1 - uploadProgress / 100)}`}
                                        strokeLinecap="round"
                                        style={{
                                            transition:
                                                "stroke-dashoffset 0.3s ease",
                                        }}
                                    />
                                </svg>
                                <span className="text-xs font-mono text-violet-400 z-10">
                                    {Math.round(uploadProgress)}%
                                </span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white/70">
                                    Enviando {dragFile?.name}...
                                </p>
                                <p className="text-xs text-white/30 mt-1">
                                    Aguarde
                                </p>
                            </div>
                        </>
                    ) : isDragging ? (
                        <>
                            <div className="w-14 h-14 rounded-full bg-violet-500/20 flex items-center justify-center text-2xl animate-bounce">
                                🎙
                            </div>
                            <p className="text-sm font-semibold text-violet-400">
                                Solte para enviar!
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
                                <svg
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.3)"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white/60">
                                    Arraste o áudio aqui ou{" "}
                                    <span className="text-violet-400 underline underline-offset-2">
                                        clique para selecionar
                                    </span>
                                </p>
                                <p className="text-xs text-white/25 mt-1.5">
                                    MP3, OGG, WAV, M4A, AAC, FLAC · máx. 20MB
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Shimmer border quando dragging */}
                {isDragging && (
                    <div
                        className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{
                            boxShadow:
                                "inset 0 0 0 2px rgba(124,58,237,0.6), 0 0 30px rgba(124,58,237,0.15)",
                        }}
                    />
                )}
            </div>

            {/* Feedback */}
            {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-2.5 text-sm text-red-400">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-4 py-2.5 text-sm text-emerald-400">
                    {success}
                </div>
            )}
        </div>
    );
}
