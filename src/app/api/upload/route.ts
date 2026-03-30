// app/api/upload/route.ts
//
// Processa arquivos antes de salvar no Vercel Blob:
//   - Áudio (mp3, wav, m4a, aac, flac) → converte para OGG Opus (mono 48kHz)
//   - Vídeo (mp4, mov) → comprime com H.264 CRF 28, escala para max 720p
//   - Imagem → passa direto sem processamento

import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { unlink } from "fs/promises";

// Limite de body para o App Router (substitui o config deprecated)
export const maxDuration = 60; // segundos — necessário para vídeos grandes

// Responde ao preflight CORS para o método DELETE
export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            Allow: "POST, DELETE, OPTIONS",
            "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Accept",
        },
    });
}

// ─── ffmpeg helper ────────────────────────────────────────────────────────────

async function runFfmpeg(args: string[]): Promise<void> {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    // maxBuffer de 500MB para não travar em vídeos grandes
    await execFileAsync("ffmpeg", args, { maxBuffer: 500 * 1024 * 1024 });
}

// ─── Audio → OGG Opus ────────────────────────────────────────────────────────

async function convertToOggOpus(
    buffer: Buffer,
    inputExt: string,
): Promise<Buffer> {
    // Usa UUID para garantir nomes únicos — evita colisão entre requisições paralelas
    const id = randomUUID();
    const tmpIn = path.join(os.tmpdir(), `audio_in_${id}.${inputExt}`);
    const tmpOut = path.join(os.tmpdir(), `audio_out_${id}.ogg`); // extensão diferente

    await fs.promises.writeFile(tmpIn, buffer);

    try {
        await runFfmpeg([
            "-y",
            "-i",
            tmpIn,
            "-c:a",
            "libopus",
            "-ac",
            "1", // mono
            "-ar",
            "48000", // 48kHz (padrão Telegram voice)
            "-b:a",
            "32k", // 32kbps — suficiente para voz
            "-vn", // descarta stream de vídeo se existir
            tmpOut,
        ]);
    } finally {
        await fs.promises.unlink(tmpIn).catch(() => {});
    }

    const out = await fs.promises.readFile(tmpOut);
    await fs.promises.unlink(tmpOut).catch(() => {});
    return out;
}

// ─── Video → H.264 compressed ────────────────────────────────────────────────

async function compressVideo(
    buffer: Buffer,
    inputExt: string,
): Promise<Buffer> {
    // Usa UUID + extensões distintas — o ffmpeg não pode ter input == output
    const id = randomUUID();
    const tmpIn = path.join(os.tmpdir(), `video_in_${id}.${inputExt}`);
    const tmpOut = path.join(os.tmpdir(), `video_out_${id}.mp4`); // sempre .mp4

    await fs.promises.writeFile(tmpIn, buffer);

    try {
        await runFfmpeg([
            "-y",
            "-i",
            tmpIn,
            // Escala para max 720p mantendo aspect ratio, só se maior
            // Garante que width e height sejam divisíveis por 2 (exigido pelo libx264)
            "-vf",
            "scale=trunc(min(iw\\,1280)/2)*2:trunc(ow/dar/2)*2",
            "-c:v",
            "libx264",
            "-crf",
            "28",
            "-preset",
            "fast",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-ac",
            "2",
            tmpOut,
        ]);
    } finally {
        await fs.promises.unlink(tmpIn).catch(() => {});
    }

    const out = await fs.promises.readFile(tmpOut);
    await fs.promises.unlink(tmpOut).catch(() => {});
    return out;
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
        "audio/x-wav",
        "audio/m4a",
        "audio/x-m4a",
        "audio/aac",
        "audio/flac",
        "audio/mp4",
    ];

    if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
            { error: `Tipo de arquivo não permitido: ${file.type}` },
            { status: 422 },
        );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const originalExt = file.name.split(".").pop()?.toLowerCase() ?? "bin";

    const isAudio = file.type.startsWith("audio/");
    const isVideo = file.type.startsWith("video/");

    let finalBuffer: Buffer;
    let finalContentType: string;
    let finalExt: string;
    let processingNote: string;

    // --- Lógica de processamento (mantida idêntica) ---
    if (isAudio && originalExt !== "ogg") {
        try {
            finalBuffer = await convertToOggOpus(rawBuffer, originalExt);
            finalContentType = "audio/ogg";
            finalExt = "ogg";
            processingNote = `áudio convertido de ${originalExt} para OGG Opus`;
        } catch (err: any) {
            console.error(
                "[upload] Falha na conversão de áudio:",
                err?.message,
            );
            finalBuffer = rawBuffer;
            finalContentType = file.type;
            finalExt = originalExt;
            processingNote = `áudio salvo sem conversão (erro: ${err?.message})`;
        }
    } else if (isVideo) {
        try {
            const sizeBefore = rawBuffer.length;
            finalBuffer = await compressVideo(rawBuffer, originalExt);
            const sizeAfter = finalBuffer.length;
            const reduction = (
                ((sizeBefore - sizeAfter) / sizeBefore) *
                100
            ).toFixed(1);
            finalContentType = "video/mp4";
            finalExt = "mp4";
            processingNote = `vídeo comprimido: ${(sizeBefore / 1024 / 1024).toFixed(1)}MB → ${(sizeAfter / 1024 / 1024).toFixed(1)}MB (-${reduction}%)`;
        } catch (err: any) {
            console.error(
                "[upload] Falha na compressão de vídeo:",
                err?.message,
            );
            finalBuffer = rawBuffer;
            finalContentType = file.type;
            finalExt = originalExt;
            processingNote = `vídeo salvo sem compressão (erro: ${err?.message})`;
        }
    } else {
        finalBuffer = rawBuffer;
        finalContentType = file.type;
        finalExt = originalExt;
        processingNote = "arquivo salvo sem processamento";
    }

    // --- Nova Lógica de salvamento local ---

    const baseName = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "");

    const relativePath = `templates/${Date.now()}-${baseName}.${finalExt}`;

    // Caminho absoluto para a pasta public do seu projeto
    const uploadDir = path.join(process.cwd(), "public", "templates");
    const fullPath = path.join(process.cwd(), "public", relativePath);

    try {
        // Garante que a subpasta templates existe dentro de public
        await mkdir(uploadDir, { recursive: true });

        // Salva o buffer no disco do servidor
        await writeFile(fullPath, finalBuffer);

        // Gera a URL baseada no host atual da requisição
        const host = req.headers.get("host");
        const protocol =
            process.env.NODE_ENV === "production" ? "https" : "http";
        const fileUrl = `${protocol}://${host}/${relativePath}`;

        console.log(`[upload] ${processingNote} → ${fileUrl}`);

        return NextResponse.json({
            url: fileUrl,
            contentType: finalContentType,
            processingNote,
            originalSize: rawBuffer.length,
            finalSize: finalBuffer.length,
        });
    } catch (saveErr: any) {
        console.error("[upload] Erro ao salvar no disco:", saveErr.message);
        return NextResponse.json(
            { error: "Erro interno ao salvar arquivo no servidor." },
            { status: 500 },
        );
    }
}

// ─── DELETE — remove arquivo do Vercel Blob ───────────────────────────────────

export async function DELETE(req: NextRequest) {
    let fileUrl: string | undefined;

    try {
        const text = await req.text();
        const body = JSON.parse(text) as { url?: string };
        fileUrl = body.url;
    } catch {
        return NextResponse.json(
            { error: "Body inválido. Envie JSON com { url }." },
            { status: 400 },
        );
    }

    if (!fileUrl) {
        return NextResponse.json(
            { error: "Campo 'url' não informado." },
            { status: 400 },
        );
    }

    try {
        // 1. Extrair o nome do arquivo da URL (ex: https://dominio.com/templates/123-file.mp4)
        // O split("/") pega a última parte da URL
        const urlParts = fileUrl.split("/");
        const fileName = urlParts[urlParts.length - 1];

        // 2. Montar o caminho absoluto para o arquivo no servidor
        // Importante: Deve bater com o caminho usado no POST (public/templates)
        const filePath = path.join(
            process.cwd(),
            "public",
            "templates",
            fileName,
        );

        // 3. Deletar o arquivo do disco
        await unlink(filePath);

        console.log(`[upload] deletado do servidor: ${filePath}`);

        return NextResponse.json({
            deleted: true,
            url: fileUrl,
            message: "Arquivo removido com sucesso do servidor local.",
        });
    } catch (err: any) {
        // Caso o arquivo não exista, o Node lança um erro ENOENT
        if (err.code === "ENOENT") {
            console.warn(
                `[upload] Tentativa de deletar arquivo inexistente: ${fileUrl}`,
            );
            return NextResponse.json(
                { error: "Arquivo não encontrado no servidor." },
                { status: 404 },
            );
        }

        console.error("[upload] Erro ao deletar arquivo local:", err?.message);
        return NextResponse.json(
            { error: "Erro interno ao deletar arquivo do servidor." },
            { status: 500 },
        );
    }
}
