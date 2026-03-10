// app/api/discount-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const botId = searchParams.get("botId");
    if (!botId)
        return NextResponse.json({ error: "botId required" }, { status: 400 });

    const config = await prisma.discountConfig.findUnique({
        where: { botId },
        include: { product: true },
    });
    return NextResponse.json(config ?? null);
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { botId, productId, discountPercent } = body;

    if (!botId || !productId || discountPercent == null) {
        return NextResponse.json(
            { error: "botId, productId e discountPercent são obrigatórios" },
            { status: 400 },
        );
    }

    if (discountPercent < 1 || discountPercent > 99) {
        return NextResponse.json(
            { error: "Desconto deve ser entre 1% e 99%" },
            { status: 400 },
        );
    }

    const config = await prisma.discountConfig.upsert({
        where: { botId },
        update: {
            productId,
            discountPercent,
            isActive: true,
            updatedAt: new Date(),
        },
        create: { botId, productId, discountPercent },
        include: { product: true },
    });

    return NextResponse.json(config);
}

export async function PATCH(req: NextRequest) {
    const body = await req.json();
    const { botId, isActive } = body;

    const config = await prisma.discountConfig.update({
        where: { botId },
        data: { isActive },
        include: { product: true },
    });

    return NextResponse.json(config);
}
