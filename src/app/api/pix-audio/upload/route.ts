// app/api/pix-audio/upload/route.ts
import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; // opcional, remove se preferir Node

export async function POST(req: NextRequest) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const botId = await prisma.botAccount.findFirst({
        where: {
            isActive: true,
            businessBotToken: {
                not: null,
            },
        },
    });

    console.log("file recebido: ", botId);

    if (!file || !botId?.id) {
        return NextResponse.json(
            { error: "file e botId são obrigatórios" },
            { status: 400 },
        );
    }

    // check botid
    const hasBot = await prisma.botAccount.findFirst({
        where: { id: botId.id },
    });

    if (!hasBot) {
        return NextResponse.json(
            { error: "file e botId são obrigatórios" },
            { status: 400 },
        );
    }

    const allowed = [
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/mp4",
        "audio/aac",
        "audio/flac",
    ];
    if (!allowed.includes(file.type)) {
        return NextResponse.json(
            { error: "Formato inválido. Use MP3, OGG, WAV, M4A, AAC ou FLAC." },
            { status: 400 },
        );
    }

    // Remove blob anterior se existir
    const existing = await prisma.pixAudioConfig.findUnique({
        where: { botId: botId.id },
    });
    if (existing?.audioUrl) {
        try {
            await del(existing.audioUrl);
        } catch (_) {}
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await put(`pix-audio/${botId}/${safeName}`, file, {
        access: "public",
        contentType: file.type,
        allowOverwrite: true,
    });

    const config = await prisma.pixAudioConfig.upsert({
        where: { botId: botId.id },
        update: {
            audioUrl: blob.url,
            fileName: file.name,
            isActive: true,
            updatedAt: new Date(),
        },
        create: {
            botId: botId.id,
            audioUrl: blob.url,
            fileName: file.name,
            isActive: true,
        },
    });

    return NextResponse.json(config);
}
