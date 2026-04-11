import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { savePublicFile } from "@/lib/storage/public-file-storage";

export const runtime = "nodejs";

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
];

function getMaxUploadSizeBytes(): number {
    const maxUploadMb = Number(process.env.PRODUCT_IMAGE_UPLOAD_MAX_MB ?? 5);

    if (!Number.isFinite(maxUploadMb) || maxUploadMb <= 0) {
        return 5 * 1024 * 1024;
    }

    return Math.trunc(maxUploadMb * 1024 * 1024);
}

export async function POST(req: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json(
            { error: "Sessao invalida para upload de imagem." },
            { status: 401 },
        );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
        return NextResponse.json(
            { error: "Nenhuma imagem enviada." },
            { status: 400 },
        );
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return NextResponse.json(
            { error: "Formato de imagem invalido. Use JPG, PNG, WEBP ou GIF." },
            { status: 422 },
        );
    }

    const maxUploadSizeBytes = getMaxUploadSizeBytes();

    if (file.size > maxUploadSizeBytes) {
        return NextResponse.json(
            {
                error: `A imagem excede o limite de ${Math.round(
                    maxUploadSizeBytes / 1024 / 1024,
                )}MB.`,
            },
            { status: 413 },
        );
    }

    const savedFile = await savePublicFile({
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        originalFileName: file.name,
        folder: `products/${session.user.id}`,
    });

    return NextResponse.json({
        url: savedFile.url,
        key: savedFile.key,
        driver: savedFile.driver,
    });
}
