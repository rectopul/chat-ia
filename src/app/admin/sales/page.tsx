import { prisma } from "@/lib/prisma";
import {
  CreditCard,
  User,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Hash,
  Download
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function AdminSalesPage() {
  const sales = await prisma.sale.findMany({
    include: { user: true, product: true },
    orderBy: { createdAt: "desc" },
  });

  const statusMap: Record<string, { label: string, color: string, icon: any }> = {
    PAID: { label: "Pago", color: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: CheckCircle2 },
    PENDING: { label: "Pendente", color: "bg-amber-50 text-amber-700 border-amber-100", icon: Clock },
    CANCELED: { label: "Cancelado", color: "bg-rose-50 text-rose-700 border-rose-100", icon: AlertCircle },
    REFUNDED: { label: "Reembolsado", color: "bg-slate-100 text-slate-700 border-slate-200", icon: AlertCircle },
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                <CreditCard className="w-8 h-8 text-primary" />
                Histórico de Vendas
            </h1>
            <p className="text-slate-500">Acompanhe todas as transações realizadas pelos seus usuários.</p>
        </div>
        <Button variant="outline" className="border-slate-200 bg-white">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
        </Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="hover:bg-transparent border-slate-100">
              <TableHead className="font-bold text-slate-700">Referência / Produto</TableHead>
              <TableHead className="font-bold text-slate-700">Comprador</TableHead>
              <TableHead className="font-bold text-slate-700">Valor</TableHead>
              <TableHead className="font-bold text-slate-700 text-center">Status</TableHead>
              <TableHead className="text-right font-bold text-slate-700">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((s) => {
              const status = statusMap[s.status] || { label: s.status, color: "bg-slate-100", icon: AlertCircle };
              return (
                <TableRow key={s.id} className="border-slate-50 hover:bg-slate-50/30 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 uppercase tracking-tighter mb-1">
                        <Hash className="w-3 h-3" />
                        {s.referenceId}
                    </div>
                    <div className="font-bold text-slate-900 leading-none">{s.product.title}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-slate-700">@{s.user.username || "n/a"}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{s.telegramUserId}</div>
                        </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-slate-900">
                        R$ {(s.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${status.color} shadow-none border hover:opacity-100 px-2 py-0.5 font-bold text-[10px]`}>
                        <status.icon className="w-3 h-3 mr-1" />
                        {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-0.5">
                        <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {s.createdAt.toLocaleDateString('pt-BR')}
                        </div>
                        <div className="text-[10px] text-slate-400">
                            {s.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {sales.length === 0 && (
                <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">
                        Nenhuma venda registrada até o momento.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
