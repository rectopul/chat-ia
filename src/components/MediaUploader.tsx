"use client";
// components/MediaUploader.tsx
// Componente reutilizável de upload. Chama /api/upload e devolve a URL via onUploaded.

import { useState, useRef } from "react";
import axios from "axios";

interface Props {
    label?: string;
    accept?: string; // ex: "image/*,video/*"
    onUploaded: (url: string) => void;
    currentUrl?: string;
}

export function MediaUploader({
    label = "Clique ou arraste um arquivo",
    accept = "image/*,video/*,audio/*",
    onUploaded,
    currentUrl,
}: Props) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
    const [error, setError] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        setError("");
        setUploading(true);

        // Preview local imediato
        if (file.type.startsWith("image/")) {
            setPreview(URL.createObjectURL(file));
        } else {
            setPreview(null);
        }

        try {
            const fd = new FormData();
            fd.append("file", file);

            const { data } = await axios.post<{ url: string }>(
                "/api/upload",
                fd,
            );
            onUploaded(data.url);
            setPreview(data.url);
        } catch (err: any) {
            setError(err.response?.data?.error ?? "Erro ao fazer upload.");
            setPreview(null);
        } finally {
            setUploading(false);
        }
    };

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    return (
        <div className="flex flex-col gap-2">
            <div
                onClick={() => inputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer transition
                    ${uploading ? "border-indigo-300 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={onInputChange}
                />

                {uploading ? (
                    <p className="text-sm text-indigo-500 animate-pulse">
                        Enviando...
                    </p>
                ) : preview ? (
                    <div className="flex flex-col items-center gap-2 w-full">
                        {preview.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
                        preview.startsWith("blob:") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={preview}
                                alt="preview"
                                className="max-h-32 rounded object-contain"
                            />
                        ) : (
                            <span className="text-xs text-gray-500 font-mono truncate max-w-full px-2">
                                {preview}
                            </span>
                        )}
                        <span className="text-xs text-indigo-500">
                            Clique para trocar
                        </span>
                    </div>
                ) : (
                    <>
                        <svg
                            className="w-8 h-8 text-gray-400 mb-1"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                            />
                        </svg>
                        <p className="text-sm text-gray-500">{label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {accept.replace(/\*/g, "qualquer")}
                        </p>
                    </>
                )}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    );
}
