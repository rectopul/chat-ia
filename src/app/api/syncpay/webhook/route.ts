import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SyncPayService } from "@/lib/syncpay";
import { TelegramService } from "@/lib/telegram";
import { SaleStatus } from "@prisma/client";
import axios from "axios";
import { handleSaasWebhook } from "@/lib/saas/server";

const NESTAPI_URL = process.env.API_URL;

export async function POST(req: NextRequest) {
    const signature = req.headers.get("x-syncpay-signature") || "";
    const rawBody = await req.text();

    // if (!SyncPayService.verifyWebhookSignature(rawBody, signature)) {
    //     // In many cases, you might want to log this but return 200 to stop retries if it's just a config issue
    //     console.warn("Invalid SyncPay signature received");
    //     // return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    // }

    try {
        const payload = JSON.parse(rawBody);
        const { data } = payload; // Based on onUpdate schema: { data: { id, status, ... } }

        if (!data || !data.id) {
            return NextResponse.json({ ok: true });
        }

        // Log the event
        await prisma.webhookEvent.create({
            data: {
                provider: "SYNCPAY",
                eventType: "update",
                referenceId: data.id,
                rawPayload: payload,
            },
        });

        const normalizedStatus = String(data.status ?? "")
            .trim()
            .toLowerCase();

        if (
            normalizedStatus === "paid" ||
            normalizedStatus === "completed" ||
            normalizedStatus === "succeeded" ||
            normalizedStatus === "pago" ||
            normalizedStatus === "aprovado"
        ) {
            const sale = await prisma.sale.findFirst({
                where: {
                    OR: [
                        { referenceId: String(data.external_reference ?? "") },
                        { referenceId: String(data.id ?? "") },
                        {
                            rawPayload: {
                                path: ["identifier"],
                                equals: String(data.id ?? ""),
                            },
                        },
                        {
                            rawPayload: {
                                path: ["pix_code"],
                                equals: data.pix_code,
                            },
                        },
                    ],
                },
                include: { user: true, product: true, bot: true },
            });

            if (sale && sale.status !== SaleStatus.PAID) {
                await prisma.sale.update({
                    where: { id: sale.id },
                    data: {
                        status: SaleStatus.PAID,
                        paidAt: new Date(),
                        rawPayload: payload,
                    },
                });

                let newUntil: Date | null = null;
                if (
                    sale.product.productType === "SUBSCRIPTION" &&
                    sale.product.subscriberDays
                ) {
                    const currentUntil = sale.user.subscriberUntil || new Date();
                    const baseDate =
                        currentUntil > new Date() ? currentUntil : new Date();
                    newUntil = new Date(
                        baseDate.getTime() +
                            sale.product.subscriberDays * 24 * 60 * 60 * 1000,
                    );
                }

                await prisma.telegramUser.update({
                    where: {
                        telegramUserId_botId: {
                            telegramUserId: sale.telegramUserId,
                            botId: sale.botId,
                        },
                    },
                    data: {
                        isSubscriber: true,
                        subscriberUntil: newUntil,
                    },
                });

                if (sale.id && NESTAPI_URL) {
                    await axios.post(`${NESTAPI_URL}/telegram/confirm-payment`, {
                        saleId: sale.id,
                    });
                }
            }
        }

        await handleSaasWebhook(payload);

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error in SyncPay webhook:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
