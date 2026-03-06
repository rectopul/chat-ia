import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
    try {
        const nestUrl = process.env.NEST_API_URL;
        const secret = process.env.CRON_SECRET;

        if (!nestUrl) {
            return NextResponse.json(
                { error: "NEST_API_URL não configurado." },
                { status: 500 },
            );
        }

        const res = await fetch(`${nestUrl}/templates/process-jobs`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(secret ? { "x-cron-secret": secret } : {}),
            },
        });

        const data = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch (error: any) {
        console.log("Erro na cron", error.message);
        return NextResponse.json(
            {
                message: "erro aop processar cron jobs",
                details: error.message,
            },
            { status: 500 },
        );
    }
}
