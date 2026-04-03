"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getPhoneNumberVariants, normalizePhoneNumber } from "@/lib/bot-phone";
import { requireSuperAdminUser } from "@/lib/server-session";

function buildAdminStatusRedirect(
    type: "error" | "success",
    code: string,
    phoneNumber?: string,
): never {
    const params = new URLSearchParams({ [type]: code });

    if (phoneNumber) {
        params.set("phoneNumber", phoneNumber);
    }

    redirect(`/admin/bots?${params.toString()}`);
}

export async function createAdminBotAction(formData: FormData) {
    await requireSuperAdminUser();

    const name = String(formData.get("name") ?? "").trim();
    const normalizedPhoneNumber = normalizePhoneNumber(
        String(formData.get("phoneNumber") ?? ""),
    );
    const apiId = Number(formData.get("apiId") ?? 0);
    const apiHash = String(formData.get("apiHash") ?? "").trim();
    const ownerUserId =
        String(formData.get("ownerUserId") ?? "").trim() || null;

    const existingBot = await prisma.botAccount.findFirst({
        where: {
            phoneNumber: {
                in: getPhoneNumberVariants(normalizedPhoneNumber),
            },
        },
        select: { id: true },
    });

    if (existingBot) {
        buildAdminStatusRedirect(
            "error",
            "phone_number_unavailable",
            normalizedPhoneNumber,
        );
    }

    try {
        await prisma.botAccount.create({
            data: {
                name,
                phoneNumber: normalizedPhoneNumber,
                apiId,
                apiHash,
                ownerUserId,
                isUserAccount: true,
                isActive: false,
            },
        });
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            buildAdminStatusRedirect(
                "error",
                "phone_number_unavailable",
                normalizedPhoneNumber,
            );
        }

        throw error;
    }

    revalidatePath("/admin/bots");
    buildAdminStatusRedirect("success", "bot_created", normalizedPhoneNumber);
}

export async function deleteAdminBotAction(botId: string) {
    await requireSuperAdminUser();

    await prisma.botAccount.delete({
        where: { id: botId },
    });

    revalidatePath("/admin/bots");
}

export async function saveAdminBotTokenAction(botId: string, token: string) {
    await requireSuperAdminUser();

    await prisma.botAccount.update({
        where: { id: botId },
        data: { businessBotToken: token || null },
    });

    revalidatePath("/admin/bots");
}

export async function toggleAdminBotAction(
    botId: string,
    currentStatus: boolean,
) {
    await requireSuperAdminUser();

    await prisma.botAccount.update({
        where: { id: botId },
        data: { isActive: !currentStatus },
    });

    revalidatePath("/admin/bots");
}
