// app/api/upload/route.ts
// Rota Next.js que recebe o arquivo do browser e faz upload para o Vercel Blob.
// O frontend chama POST /api/upload com multipart/form-data { file: File }.
// Retorna { url } com a URL pública do blob.

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
        return NextResponse.json(
            { error: "Nenhum arquivo enviado." },
            { status: 400 },
        );
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "video/mp4",
        "video/quicktime",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
    ];

    if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
            { error: `Tipo de arquivo não permitido: ${file.type}` },
            { status: 422 },
        );
    }

    const filename = `templates/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;

    const blob = await put(filename, file, {
        access: "public",
        contentType: file.type,
    });

    return NextResponse.json({ url: blob.url });
}
