"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getPhoneNumberVariants, normalizePhoneNumber } from "@/lib/bot-phone";
import { requireSessionUser } from "@/lib/server-session";

function buildStatusRedirect(
    type: "error" | "success",
    code: string,
    phoneNumber?: string,
): never {
    const params = new URLSearchParams({ [type]: code });

    if (phoneNumber) {
        params.set("phoneNumber", phoneNumber);
    }

    redirect(`/dashboard/bots?${params.toString()}`);
}

export async function createUserBotAction(formData: FormData) {
    const user = await requireSessionUser();
    const name = String(formData.get("name") ?? "").trim();
    const normalizedPhoneNumber = normalizePhoneNumber(
        String(formData.get("phoneNumber") ?? ""),
    );
    const apiId = Number(formData.get("apiId") ?? 0);
    const apiHash = String(formData.get("apiHash") ?? "").trim();

    if (!name || !normalizedPhoneNumber || !apiId || !apiHash) {
        buildStatusRedirect("error", "invalid_bot_form", normalizedPhoneNumber);
    }

    const existingBot = await prisma.botAccount.findFirst({
        where: {
            phoneNumber: {
                in: getPhoneNumberVariants(normalizedPhoneNumber),
            },
        },
        select: { id: true },
    });

    if (existingBot) {
        buildStatusRedirect(
            "error",
            "phone_number_unavailable",
            normalizedPhoneNumber,
        );
    }

    try {
        await prisma.botAccount.create({
            data: {
                ownerUserId: user.id,
                name,
                phoneNumber: normalizedPhoneNumber,
                apiId,
                apiHash,
                isUserAccount: true,
                isActive: false,
            },
        });
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            buildStatusRedirect(
                "error",
                "phone_number_unavailable",
                normalizedPhoneNumber,
            );
        }

        throw error;
    }

    revalidatePath("/dashboard/bots");
    buildStatusRedirect("success", "bot_created", normalizedPhoneNumber);
}

export async function deleteUserBotAction(botId: string) {
    const user = await requireSessionUser();

    await prisma.botAccount.deleteMany({
        where: {
            id: botId,
            ownerUserId: user.id,
        },
    });

    revalidatePath("/dashboard/bots");
}

export async function saveUserBotTokenAction(botId: string, token: string) {
    const user = await requireSessionUser();

    await prisma.botAccount.updateMany({
        where: { id: botId, ownerUserId: user.id },
        data: { businessBotToken: token || null },
    });

    revalidatePath("/dashboard/bots");
}

export async function toggleUserBotAction(
    botId: string,
    currentStatus: boolean,
) {
    const user = await requireSessionUser();

    await prisma.botAccount.updateMany({
        where: { id: botId, ownerUserId: user.id },
        data: { isActive: !currentStatus },
    });

    revalidatePath("/dashboard/bots");
}
