"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createSchedule(formData: FormData) {
    const botId = formData.get("botId") as string;
    const templateId = formData.get("templateId") as string;
    const time = formData.get("time") as string;
    const [hour, minute] = time.split(":").map(Number);
    const weekDays = formData.getAll("weekDays").map(Number);

    await prisma.recurringSchedule.create({
        data: { botId, templateId, hour, minute, weekDays },
    });
    revalidatePath("/admin/schedules");
}

export async function toggleSchedule(id: string, current: boolean) {
    await prisma.recurringSchedule.update({
        where: { id },
        data: { isActive: !current },
    });
    revalidatePath("/admin/schedules");
}

export async function deleteSchedule(id: string) {
    await prisma.recurringSchedule.delete({ where: { id } });
    revalidatePath("/admin/schedules");
}
