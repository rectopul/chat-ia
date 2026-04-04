import { NextRequest, NextResponse } from "next/server";
import { getNestApiBaseUrl } from "@/lib/nest-api";

export async function POST(req: NextRequest) {
    const rawBody = await req.text();

    try {
        const response = await fetch(`${getNestApiBaseUrl()}/api/syncpay/webhook`, {
            method: "POST",
            headers: {
                "Content-Type":
                    req.headers.get("content-type") ?? "application/json",
                "x-syncpay-signature":
                    req.headers.get("x-syncpay-signature") ?? "",
            },
            body: rawBody,
            cache: "no-store",
        });

        const rawResponse = await response.text();
        let payload: any = { ok: response.ok };

        if (rawResponse) {
            try {
                payload = JSON.parse(rawResponse);
            } catch {
                payload = { ok: response.ok, body: rawResponse };
            }
        }

        return NextResponse.json(payload, { status: response.status });
    } catch (error) {
        console.error("Error proxying SyncPay webhook to Nest:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
