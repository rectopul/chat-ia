import { DontSellIntervalsManager } from "@/components/pages/dont-sell-interval";
import { prisma } from "@/lib/prisma";

export default async function DontSellConfigPage() {
    const activeBot = await prisma.botAccount.findFirst({
        where: { isActive: true },
    });

    if (!activeBot) {
        return <div className="">Ative um bot antes de configurar</div>;
    }

    return <DontSellIntervalsManager botId={activeBot.id} />;
}
