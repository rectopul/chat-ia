import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SyncPayService } from "@/lib/syncpay";
import { TelegramService } from "@/lib/telegram";
import { SaleStatus } from "@prisma/client";
import axios from "axios";

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

        if (
            data.status === "paid" ||
            data.status === "completed" ||
            data.status === "succeeded"
        ) {
            const referenceId = data.id; // Or mapping if you use a different internal ref

            // SyncPay doc shows "id" in data as the identifier.
            // We should check if this matches our identifier or if we need to search by pix_code
            const sale = await prisma.sale.findFirst({
                where: {
                    OR: [
                        { referenceId: referenceId },
                        {
                            rawPayload: {
                                path: ["pix_code"],
                                equals: data.pix_code,
                            },
                        }, // Advanced query if needed
                    ],
                },
                include: { user: true, product: true },
            });

            // Simpler approach if we store the 'identifier' from cash-in as referenceId
            const targetSale = await prisma.sale.findFirst({
                where: { referenceId: data.id },
                include: { user: true, product: true, bot: true },
            });

            if (targetSale && targetSale.status !== SaleStatus.PAID) {
                // Update Sale
                await prisma.sale.update({
                    where: { id: targetSale.id },
                    data: {
                        status: SaleStatus.PAID,
                        paidAt: new Date(),
                        rawPayload: payload,
                    },
                });

                // Grant access / Subscription
                let newUntil: Date | null = null;
                if (
                    targetSale.product.productType === "SUBSCRIPTION" &&
                    targetSale.product.subscriberDays
                ) {
                    const currentUntil =
                        targetSale.user.subscriberUntil || new Date();
                    const baseDate =
                        currentUntil > new Date() ? currentUntil : new Date();
                    newUntil = new Date(
                        baseDate.getTime() +
                            targetSale.product.subscriberDays *
                                24 *
                                60 *
                                60 *
                                1000,
                    );
                }

                await prisma.telegramUser.update({
                    where: {
                        telegramUserId_botId: {
                            telegramUserId: targetSale.telegramUserId,
                            botId: targetSale.botId,
                        },
                    },
                    data: {
                        isSubscriber: true,
                        subscriberUntil: newUntil,
                    },
                });
            }

            await axios.post(`${NESTAPI_URL}/telegram/confirm-payment`, {
                saleId: sale?.id,
            });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error in SyncPay webhook:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
