import { prisma } from "@/lib/prisma";
import { UserSegment } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { CampaignsClient } from "@/components/pages/campaigns-client"; // ajuste o path conforme sua estrutura

const MIN_GAP_SECONDS = 10;

export default async function AdminCampaignsPage() {
    const [rules, templates, bots] = await prisma.$transaction([
        prisma.timedMessageRule.findMany({
            include: { template: true, bot: true },
            orderBy: { delaySeconds: "asc" },
        }),
        prisma.messageTemplate.findMany({ where: { key: "TIMED" } }),
        prisma.botAccount.findMany({ where: { isActive: true } }),
    ]);

    async function createRule(formData: FormData): Promise<{ error?: string }> {
        "use server";

        const name = formData.get("name") as string;
        const botId = formData.get("botId") as string;
        const delaySeconds = parseInt(formData.get("delaySeconds") as string);
        const repeatIntervalSeconds = formData.get("repeatIntervalSeconds")
            ? parseInt(formData.get("repeatIntervalSeconds") as string)
            : null;
        const segment = formData.get("segment") as UserSegment;
        const templateId = formData.get("templateId") as string;

        // ── Validação server-side do intervalo mínimo ────────────────────────────
        const existingRules = await prisma.timedMessageRule.findMany({
            where: { botId },
            select: { delaySeconds: true, name: true },
        });

        for (const existing of existingRules) {
            if (
                Math.abs(existing.delaySeconds - delaySeconds) < MIN_GAP_SECONDS
            ) {
                return {
                    error: `Conflito com a regra "${existing.name}" (delay: ${existing.delaySeconds}s). Mantenha pelo menos ${MIN_GAP_SECONDS}s de distância entre templates do mesmo bot.`,
                };
            }
        }
        // ─────────────────────────────────────────────────────────────────────────

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

    async function deleteRule(ruleId: string): Promise<void> {
        "use server";
        await prisma.timedMessageRule.delete({ where: { id: ruleId } });
        revalidatePath("/admin/campaigns");
    }

    return (
        <CampaignsClient
            rules={rules as any}
            templates={templates}
            bots={bots}
            createRule={createRule}
            deleteRule={deleteRule}
        />
    );
}
