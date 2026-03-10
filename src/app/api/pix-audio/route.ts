// app/api/pix-audio/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const botId = searchParams.get("botId");
    if (!botId)
        return NextResponse.json({ error: "botId required" }, { status: 400 });

    const config = await prisma.pixAudioConfig.findUnique({ where: { botId } });
    return NextResponse.json(config ?? null);
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { botId, audioUrl, fileName, durationSec } = body;

    if (!botId || !audioUrl || !fileName) {
        return NextResponse.json(
            { error: "botId, audioUrl e fileName são obrigatórios" },
            { status: 400 },
        );
    }

    const config = await prisma.pixAudioConfig.upsert({
        where: { botId },
        update: {
            audioUrl,
            fileName,
            durationSec: durationSec ?? null,
            isActive: true,
            updatedAt: new Date(),
        },
        create: { botId, audioUrl, fileName, durationSec: durationSec ?? null },
    });

    return NextResponse.json(config);
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const botId = searchParams.get("botId");
    if (!botId)
        return NextResponse.json({ error: "botId required" }, { status: 400 });

    await prisma.pixAudioConfig.delete({ where: { botId } });
    return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
    const body = await req.json();
    const { botId, isActive } = body;

    const config = await prisma.pixAudioConfig.update({
        where: { botId },
        data: { isActive },
    });

    return NextResponse.json(config);
}
