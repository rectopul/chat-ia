// app/api/dont-sell-intervals/route.ts

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// ── GET — lista intervalos do bot ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const botId = req.nextUrl.searchParams.get("botId");
    if (!botId) {
        return NextResponse.json(
            { error: "botId obrigatório" },
            { status: 400 },
        );
    }

    const intervals = await prisma.dontSellInterval.findMany({
        where: { botId, isActive: true },
        orderBy: { order: "asc" },
    });

    return NextResponse.json(intervals);
}

// ── POST — cria novo intervalo ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const body = (await req.json()) as {
        botId: string;
        delaySeconds: number;
    };

    if (!body.botId || body.delaySeconds == null || body.delaySeconds < 60) {
        return NextResponse.json(
            {
                error: "botId obrigatório e delaySeconds mínimo de 60 segundos.",
            },
            { status: 400 },
        );
    }

    // Verifica duplicata para o mesmo bot
    const existing = await prisma.dontSellInterval.findFirst({
        where: {
            botId: body.botId,
            delaySeconds: body.delaySeconds,
            isActive: true,
        },
    });
    if (existing) {
        return NextResponse.json(
            { error: "Já existe um intervalo com esse tempo para este bot." },
            { status: 409 },
        );
    }

    // Pega o próximo order
    const lastOrder = await prisma.dontSellInterval.aggregate({
        where: { botId: body.botId },
        _max: { order: true },
    });
    const order = (lastOrder._max.order ?? 0) + 1;

    const interval = await prisma.dontSellInterval.create({
        data: {
            botId: body.botId,
            delaySeconds: body.delaySeconds,
            order,
        },
    });

    return NextResponse.json(interval, { status: 201 });
}

// ── DELETE — remove intervalo ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    await prisma.dontSellInterval.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
}
