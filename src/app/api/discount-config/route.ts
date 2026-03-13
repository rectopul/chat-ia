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
    const { botId, productId, discountPercent, discountText } = body;

    if (
        !botId ||
        !productId ||
        discountPercent == null ||
        discountText == null
    ) {
        return NextResponse.json(
            {
                error: "botId, productId, discountPercent e discountText são obrigatórios",
            },
            { status: 400 },
        );
    }

    if (discountPercent < 1 || discountPercent > 99) {
        return NextResponse.json(
            { error: "Desconto deve ser entre 1% e 99%" },
            { status: 400 },
        );
    }

    const activeBotId = await prisma.botAccount.findFirst({
        where: { isActive: true },
    });

    if (!activeBotId) {
        return NextResponse.json(
            { error: "Nenhuma conta de bot ativa no momento" },
            { status: 400 },
        );
    }

    const config = await prisma.discountConfig.upsert({
        where: { botId: activeBotId.id },
        update: {
            productId,
            discountPercent,
            discountText,
            isActive: true,
            updatedAt: new Date(),
        },
        create: {
            botId: activeBotId.id,
            productId,
            discountPercent,
            discountText,
        },
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
