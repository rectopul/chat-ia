import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { NestApiError } from "@/lib/nest-api";
import { connectWhatsappInstance } from "@/lib/whatsapp";

export async function POST() {
    const session = await auth();

    if (!session?.user?.id || session.user.isSuperAdmin) {
        return NextResponse.json(
            { error: "Sessao invalida para conectar o WhatsApp." },
            { status: 401 },
        );
    }

    try {
        const instance = await connectWhatsappInstance(session.user.id);
        return NextResponse.json(instance);
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel iniciar a conexao do WhatsApp.",
            },
            {
                status: error instanceof NestApiError ? error.status : 500,
            },
        );
    }
}
