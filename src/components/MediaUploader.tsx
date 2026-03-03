"use client";

import { useCallback, useState } from "react";
import { uploadFile } from "@/lib/upload-actions"; // ajuste o caminho conforme seu projeto

interface UploadedFile {
    url: string;
    type: string;
    name: string;
    preview?: string;
}

interface MediaUploaderProps {
    label: string;
    fieldName: string; // nome do input hidden que receberá a URL
    accept?: string;
    onUpload?: (file: UploadedFile) => void;
}

export function MediaUploader({
    label,
    fieldName,
    accept = "image/*,video/*",
    onUpload,
}: MediaUploaderProps) {
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFile = useCallback(
        async (file: File) => {
            setError(null);
            setUploading(true);
            try {
                const fd = new FormData();
                fd.append("file", file);
                const result = await uploadFile(fd);
                const preview = file.type.startsWith("image/")
                    ? URL.createObjectURL(file)
                    : undefined;
                const uploaded = {
                    url: result.url,
                    type: result.type,
                    name: file.name,
                    preview,
                };
                setUploaded(uploaded);
                onUpload?.(uploaded);
            } catch (e: any) {
                setError(e.message ?? "Erro ao fazer upload");
            } finally {
                setUploading(false);
            }
        },
        [onUpload],
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    const onInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{label}</label>

            {/* Hidden input que será lido pelo server action pai */}
            <input type="hidden" name={fieldName} value={uploaded?.url ?? ""} />

            {!uploaded ? (
                <label
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    className={`
            flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200
            ${dragging ? "border-indigo-500 bg-indigo-50 scale-[1.01]" : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400"}
          `}
                >
                    <input
                        type="file"
                        className="hidden"
                        accept={accept}
                        onChange={onInputChange}
                    />
                    {uploading ? (
                        <div className="flex flex-col items-center gap-2 text-indigo-600">
                            <svg
                                className="animate-spin h-7 w-7"
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
                            <span className="text-sm">Enviando...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-1 text-gray-400">
                            <svg
                                className="h-8 w-8"
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
                            <span className="text-sm font-medium">
                                Arraste ou clique para enviar
                            </span>
                            <span className="text-xs">Imagens e vídeos</span>
                        </div>
                    )}
                </label>
            ) : (
                <div className="relative w-full border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                    {uploaded.preview ? (
                        <img
                            src={uploaded.preview}
                            alt={uploaded.name}
                            className="w-full h-40 object-cover"
                        />
                    ) : (
                        <div className="flex items-center justify-center h-24 text-gray-500 gap-2">
                            <svg
                                className="h-6 w-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
                                />
                            </svg>
                            <span className="text-sm truncate max-w-[180px]">
                                {uploaded.name}
                            </span>
                        </div>
                    )}
                    <div className="p-2 flex items-center justify-between bg-white border-t border-gray-100">
                        <div>
                            <p className="text-xs font-medium text-gray-700 truncate max-w-[200px]">
                                {uploaded.name}
                            </p>
                            <p className="text-xs text-gray-400">
                                {uploaded.type}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setUploaded(null)}
                            className="text-xs text-red-500 hover:underline"
                        >
                            Remover
                        </button>
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    );
}
