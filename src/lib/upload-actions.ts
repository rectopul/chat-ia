"use server";

import { put } from "@vercel/blob";

export type DetectedMediaType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

export interface UploadResult {
    url: string;
    type: DetectedMediaType;
    name: string;
}

function detectType(file: File): DetectedMediaType {
    if (file.type.startsWith("image/")) return "IMAGE";
    if (file.type.startsWith("video/")) return "VIDEO";
    if (file.type.startsWith("audio/")) return "AUDIO";
    return "DOCUMENT";
}

export async function uploadFile(formData: FormData): Promise<UploadResult> {
    const file = formData.get("file") as File;
    if (!file) throw new Error("Nenhum arquivo enviado");

    const blob = await put(`templates/${Date.now()}-${file.name}`, file, {
        access: "public",
    });

    return {
        url: blob.url,
        type: detectType(file),
        name: file.name,
    };
}
