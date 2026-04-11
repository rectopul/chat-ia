"use client";
/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type ProductImageDropzoneProps = {
    name?: string;
    initialValue?: string;
    error?: string;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,image/gif";

function buildImagePreviewLabel(imageUrl: string) {
    return imageUrl.startsWith("http") ? imageUrl : "Imagem carregada";
}

export function ProductImageDropzone({
    name = "imageUrl",
    initialValue = "",
    error,
}: ProductImageDropzoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState(initialValue);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState("");

    const handleFile = async (file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
            setUploadError("Use uma imagem JPG, PNG, WEBP ou GIF.");
            return;
        }

        setUploadError("");
        setIsUploading(true);

        try {
            const formData = new FormData();

            formData.set("file", file);

            const response = await fetch("/api/dashboard/products/upload-image", {
                method: "POST",
                body: formData,
            });
            const payload = (await response.json()) as {
                url?: string;
                error?: string;
            };

            if (!response.ok || !payload.url) {
                throw new Error(
                    payload.error || "Nao foi possivel enviar a imagem.",
                );
            }

            setImageUrl(payload.url);
            toast.success("Imagem enviada com sucesso.");
        } catch (uploadError) {
            const message =
                uploadError instanceof Error
                    ? uploadError.message
                    : "Nao foi possivel enviar a imagem.";

            setUploadError(message);
            toast.error(message);
        } finally {
            setIsUploading(false);
        }
    };

    const openFilePicker = () => {
        if (isUploading) {
            return;
        }

        inputRef.current?.click();
    };

    return (
        <div className="grid gap-3 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
                <Label>Imagem do produto</Label>
                {imageUrl ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-slate-500"
                        onClick={() => {
                            setImageUrl("");
                            setUploadError("");
                        }}
                        disabled={isUploading}
                    >
                        <Trash2 className="h-4 w-4" />
                        Remover
                    </Button>
                ) : null}
            </div>

            <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                    void handleFile(file);
                }

                event.target.value = "";
            }} />
            <input type="hidden" name={name} value={imageUrl} />

            <div
                role="button"
                tabIndex={0}
                onClick={openFilePicker}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openFilePicker();
                    }
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={(event) => {
                    event.preventDefault();
                    if (
                        !(event.currentTarget as HTMLDivElement).contains(
                            event.relatedTarget as Node | null,
                        )
                    ) {
                        setIsDragging(false);
                    }
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files?.[0];

                    if (file) {
                        void handleFile(file);
                    }
                }}
                className={[
                    "group rounded-2xl border border-dashed bg-slate-50/90 p-4 transition",
                    isDragging
                        ? "border-primary bg-primary/5"
                        : "border-slate-200 hover:border-primary/50 hover:bg-slate-50",
                    isUploading ? "pointer-events-none opacity-70" : "cursor-pointer",
                ].join(" ")}
            >
                {imageUrl ? (
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <img
                                src={imageUrl}
                                alt={buildImagePreviewLabel(imageUrl)}
                                className="h-36 w-full object-cover md:w-56"
                            />
                        </div>
                        <div className="space-y-2 text-left">
                            <p className="text-sm font-medium text-slate-900">
                                Imagem pronta para este produto
                            </p>
                            <p className="text-sm text-slate-500">
                                Arraste outra imagem aqui ou clique para trocar.
                            </p>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                                <span>JPG, PNG, WEBP ou GIF</span>
                                <span>Upload simples para o assinante</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                        <div className="rounded-full bg-white p-3 text-slate-500 shadow-sm">
                            {isUploading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <ImagePlus className="h-5 w-5" />
                            )}
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-900">
                                Arraste a imagem aqui ou clique para selecionar
                            </p>
                            <p className="text-sm text-slate-500">
                                Nada de URL manual. O sistema faz o upload e guarda a
                                imagem para o produto.
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500">
                            <UploadCloud className="h-3.5 w-3.5" />
                            JPG, PNG, WEBP ou GIF
                        </div>
                    </div>
                )}
            </div>

            {uploadError ? (
                <p className="text-sm text-destructive">{uploadError}</p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
    );
}
