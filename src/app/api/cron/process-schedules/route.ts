// app/api/cron/process-schedules/route.ts
// Adicione ao vercel.json:
//
// {
//   "crons": [
//     { "path": "/api/cron/process-jobs",      "schedule": "*/1 * * * *" },
//     { "path": "/api/cron/process-schedules", "schedule": "*/1 * * * *" }
//   ]
// }

import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
    const nestUrl = process.env.NEXT_PUBLIC_NEST_API_URL;
    const secret = process.env.CRON_SECRET;

    if (!nestUrl) {
        return NextResponse.json(
            { error: "NEST_API_URL não configurado." },
            { status: 500 },
        );
    }

    const res = await fetch(`${nestUrl}/schedules/process`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(secret ? { "x-cron-secret": secret } : {}),
        },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
}
