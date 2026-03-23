"use server";

import { prisma } from "@/lib/prisma"; // Ajuste o caminho conforme sua estrutura
import { Bot } from "../_lib/types";

export async function getBots(): Promise<Bot[]> {
    try {
        const bots = await prisma.botAccount.findMany({
            where: {
                isActive: true, // Apenas bots ativos
            },
            select: {
                id: true,
                name: true,
                phoneNumber: true,
                isActive: true,
            },
            orderBy: {
                name: "asc",
            },
        });

        return bots;
    } catch (error) {
        console.error("Erro ao buscar bots:", error);
        return [];
    }
}
