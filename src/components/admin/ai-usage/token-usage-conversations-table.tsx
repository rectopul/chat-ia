import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { AdminAiUsageConversationRow } from "@/lib/admin-ai-usage";
import {
    formatAverageTokens,
    formatDateTime,
    formatTokenCount,
} from "./formatters";

function getChannelBadgeClass(channel: AdminAiUsageConversationRow["channel"]) {
    if (channel === "WHATSAPP") {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (channel === "TELEGRAM") {
        return "border-sky-200 bg-sky-50 text-sky-700";
    }

    return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function TokenUsageConversationsTable({
    rows,
}: {
    rows: AdminAiUsageConversationRow[];
}) {
    return (
        <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader>
                <CardTitle>Consumo por conversa</CardTitle>
                <p className="text-sm text-slate-500">
                    Conversas com maior custo acumulado de tokens no sistema.
                </p>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-slate-100 hover:bg-transparent">
                            <TableHead>Contato</TableHead>
                            <TableHead>Canal</TableHead>
                            <TableHead>Cliente SaaS</TableHead>
                            <TableHead>Origem</TableHead>
                            <TableHead>Modelos</TableHead>
                            <TableHead>Requests</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Media</TableHead>
                            <TableHead>Ultimo uso</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length ? (
                            rows.map((row) => (
                                <TableRow key={row.conversationKey}>
                                    <TableCell className="max-w-[260px] whitespace-normal">
                                        <div className="space-y-1">
                                            <div className="font-semibold text-slate-900">
                                                {row.contactLabel || "Conversa sem rotulo"}
                                            </div>
                                            <div className="text-xs text-slate-500 break-all">
                                                {row.contactId || row.conversationKey}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={getChannelBadgeClass(
                                                row.channel,
                                            )}
                                        >
                                            {row.channel}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[220px] whitespace-normal">
                                        <div className="space-y-1">
                                            <div className="font-medium text-slate-800">
                                                {row.ownerName || "Sem nome"}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {row.ownerEmail || "Sem e-mail"}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-[220px] whitespace-normal text-slate-600">
                                        {row.channel === "TELEGRAM"
                                            ? row.botName || "Bot nao identificado"
                                            : row.whatsappInstanceName ||
                                              "Instancia nao identificada"}
                                    </TableCell>
                                    <TableCell className="max-w-[220px] whitespace-normal">
                                        <div className="flex flex-wrap gap-1">
                                            {row.modelsUsed.length ? (
                                                row.modelsUsed.map((model) => (
                                                    <Badge
                                                        key={`${row.conversationKey}-${model}`}
                                                        variant="secondary"
                                                    >
                                                        {model}
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-sm text-slate-400">
                                                    Sem modelo registrado
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-700">
                                        {formatTokenCount(row.requestCount)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="font-semibold text-slate-900">
                                                {formatTokenCount(
                                                    row.totalTokenCount,
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {formatTokenCount(
                                                    row.promptTokenCount,
                                                )}{" "}
                                                prompt /{" "}
                                                {formatTokenCount(
                                                    row.candidatesTokenCount,
                                                )}{" "}
                                                saida
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-500">
                                        {formatAverageTokens(
                                            row.averageTotalTokensPerRequest,
                                        )}
                                    </TableCell>
                                    <TableCell className="text-slate-500">
                                        {formatDateTime(row.lastUsageAt)}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={9}
                                    className="h-28 text-center text-slate-400 italic"
                                >
                                    Nenhuma conversa com uso de tokens registrada ainda.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
