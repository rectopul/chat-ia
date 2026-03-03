export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { processScheduledJobs } from "@/lib/scheduler";

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const secret = req.nextUrl.searchParams.get("secret");

    // if (
    //   authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    //   secret !== process.env.CRON_SECRET
    // ) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // }

    try {
        const processedCount = await processScheduledJobs();
        return NextResponse.json({ ok: true, processed: processedCount });
    } catch (error) {
        console.error("Error in cron job:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
