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
import { AdminAiUsageClientRow } from "@/lib/admin-ai-usage";
import {
    formatAverageTokens,
    formatDateTime,
    formatTokenCount,
} from "./formatters";

export default function TokenUsageClientsTable({
    rows,
}: {
    rows: AdminAiUsageClientRow[];
}) {
    return (
        <Card className="border-none shadow-sm overflow-hidden">
            <CardHeader>
                <CardTitle>Consumo por cliente SaaS</CardTitle>
                <p className="text-sm text-slate-500">
                    Ranking dos seus assinantes por uso acumulado de tokens.
                </p>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="border-slate-100 hover:bg-transparent">
                            <TableHead>Cliente</TableHead>
                            <TableHead>Conversas</TableHead>
                            <TableHead>Requests</TableHead>
                            <TableHead>Prompt</TableHead>
                            <TableHead>Saida</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Media</TableHead>
                            <TableHead>Ultimo uso</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length ? (
                            rows.map((row) => (
                                <TableRow key={row.ownerUserId}>
                                    <TableCell className="max-w-[240px]">
                                        <div className="space-y-1">
                                            <div className="font-semibold text-slate-900">
                                                {row.ownerName || "Sem nome"}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {row.ownerEmail || "Sem e-mail"}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">
                                            {formatTokenCount(row.conversationCount)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-700">
                                        {formatTokenCount(row.requestCount)}
                                    </TableCell>
                                    <TableCell className="text-slate-600">
                                        {formatTokenCount(row.promptTokenCount)}
                                    </TableCell>
                                    <TableCell className="text-slate-600">
                                        {formatTokenCount(
                                            row.candidatesTokenCount,
                                        )}
                                    </TableCell>
                                    <TableCell className="font-semibold text-slate-900">
                                        {formatTokenCount(row.totalTokenCount)}
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
                                    colSpan={8}
                                    className="h-28 text-center text-slate-400 italic"
                                >
                                    Nenhum consumo de tokens registrado ainda.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
