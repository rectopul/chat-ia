"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function deleteUser(userId: string) {
    try {
        await prisma.telegramUser.delete({
            where: {
                id: userId,
            },
        });

        revalidatePath("/admin/users");

        return { success: true };
    } catch (error) {
        console.error("Erro ao deletar usuário:", error);
        return { success: false, error: "Erro ao deletar usuário" };
    }
}
