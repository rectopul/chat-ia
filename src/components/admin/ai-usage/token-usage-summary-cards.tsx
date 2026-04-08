import { Cpu, MessageSquareText, ScanText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminAiUsageTotals } from "@/lib/admin-ai-usage";
import { formatAverageTokens, formatTokenCount } from "./formatters";

export default function TokenUsageSummaryCards({
    totals,
}: {
    totals: AdminAiUsageTotals;
}) {
    const cards = [
        {
            title: "Tokens totais",
            value: formatTokenCount(totals.totalTokenCount),
            description: formatAverageTokens(totals.averageTotalTokensPerRequest),
            icon: Cpu,
        },
        {
            title: "Tokens de prompt",
            value: formatTokenCount(totals.promptTokenCount),
            description: "Entrada enviada para o Gemini",
            icon: ScanText,
        },
        {
            title: "Tokens gerados",
            value: formatTokenCount(totals.candidatesTokenCount),
            description: "Saida devolvida pelo Gemini",
            icon: MessageSquareText,
        },
        {
            title: "Clientes SaaS ativos",
            value: formatTokenCount(totals.clientCount),
            description: `${formatTokenCount(
                totals.conversationCount,
            )} conversas | ${formatTokenCount(totals.requestCount)} requests`,
            icon: Users,
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
                <Card key={card.title} className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-sm text-slate-500">
                                {card.title}
                            </CardTitle>
                            <div className="rounded-full bg-slate-100 p-2 text-slate-600">
                                <card.icon className="h-4 w-4" />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="text-3xl font-bold text-slate-900">
                            {card.value}
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                            {card.description}
                        </p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
