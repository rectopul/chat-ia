"use server";

import { prisma } from "@/lib/prisma";
import { UserSegment } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSuperAdminUser } from "@/lib/server-session";

const MIN_GAP_SECONDS = 10;

export async function createCampaignRuleAction(
    formData: FormData,
): Promise<{ error?: string }> {
    await requireSuperAdminUser();

    const name = String(formData.get("name") ?? "").trim();
    const botId = String(formData.get("botId") ?? "");
    const delaySeconds = parseInt(String(formData.get("delaySeconds") ?? "0"), 10);
    const repeatIntervalSeconds = formData.get("repeatIntervalSeconds")
        ? parseInt(String(formData.get("repeatIntervalSeconds") ?? "0"), 10)
        : null;
    const segment = String(formData.get("segment") ?? "") as UserSegment;
    const templateId = String(formData.get("templateId") ?? "");

    const existingRules = await prisma.timedMessageRule.findMany({
        where: { botId },
        select: { delaySeconds: true, name: true },
    });

    for (const existing of existingRules) {
        if (Math.abs(existing.delaySeconds - delaySeconds) < MIN_GAP_SECONDS) {
            return {
                error: `Conflito com a regra "${existing.name}" (delay: ${existing.delaySeconds}s). Mantenha pelo menos ${MIN_GAP_SECONDS}s de distancia entre templates do mesmo bot.`,
            };
        }
    }

    await prisma.timedMessageRule.create({
        data: {
            name,
            botId,
            delaySeconds,
            repeatIntervalSeconds,
            segment,
            templateId,
        },
    });

    revalidatePath("/admin/campaigns");
    return {};
}

export async function deleteCampaignRuleAction(
    ruleId: string,
): Promise<void> {
    await requireSuperAdminUser();
    await prisma.timedMessageRule.delete({ where: { id: ruleId } });
    revalidatePath("/admin/campaigns");
}
