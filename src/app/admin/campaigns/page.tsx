import { prisma } from "@/lib/prisma";
import { CampaignsClient } from "@/components/pages/campaigns-client"; // ajuste o path conforme sua estrutura
import {
    createCampaignRuleAction,
    deleteCampaignRuleAction,
} from "./actions";

export default async function AdminCampaignsPage() {
    const [rules, templates, bots] = await prisma.$transaction([
        prisma.timedMessageRule.findMany({
            include: { template: true, bot: true },
            orderBy: { delaySeconds: "asc" },
        }),
        prisma.messageTemplate.findMany({ where: { key: "TIMED" } }),
        prisma.botAccount.findMany({ where: { isActive: true } }),
    ]);

    return (
        <CampaignsClient
            rules={rules as any}
            templates={templates}
            bots={bots}
            createRule={createCampaignRuleAction}
            deleteRule={deleteCampaignRuleAction}
        />
    );
}
