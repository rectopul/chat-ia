import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { NestApiError } from "@/lib/nest-api";
import { getWhatsappQrCode } from "@/lib/whatsapp";

export async function GET() {
    const session = await auth();

    if (!session?.user?.id || session.user.isSuperAdmin) {
        return NextResponse.json(
            { error: "Sessao invalida para consultar o QR Code." },
            { status: 401 },
        );
    }

    try {
        const payload = await getWhatsappQrCode(session.user.id);
        return NextResponse.json(payload);
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel carregar o QR Code.",
            },
            {
                status: error instanceof NestApiError ? error.status : 500,
            },
        );
    }
}
