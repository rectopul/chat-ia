"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/server-session";

export async function createWhatsappInstanceAction(formData: FormData) {
    const user = await requireSessionUser();
    const instanceName = String(formData.get("instanceName") ?? "").trim();
    const status =
        String(formData.get("status") ?? "DISCONNECTED").trim() ||
        "DISCONNECTED";

    if (!instanceName) {
        return;
    }

    await prisma.whatsappInstance.create({
        data: {
            userId: user.id,
            instanceName,
            status,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

export async function updateWhatsappInstanceAction(formData: FormData) {
    const user = await requireSessionUser();
    const id = String(formData.get("id") ?? "").trim();
    const instanceName = String(formData.get("instanceName") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!id || !instanceName || !status) {
        return;
    }

    await prisma.whatsappInstance.updateMany({
        where: {
            id,
            userId: user.id,
        },
        data: {
            instanceName,
            status,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

export async function deleteWhatsappInstanceAction(formData: FormData) {
    const user = await requireSessionUser();
    const id = String(formData.get("id") ?? "").trim();

    if (!id) {
        return;
    }

    await prisma.whatsappInstance.deleteMany({
        where: {
            id,
            userId: user.id,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}
