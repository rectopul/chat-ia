import { prisma } from "@/lib/prisma";
import { SaleStatus } from "@prisma/client";
import {
  Users,
  CreditCard,
  TrendingUp,
  ArrowRight,
  Clock
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import * as motion from "framer-motion/client";

export default async function AdminDashboard() {
  const stats = await prisma.$transaction([
    prisma.telegramUser.count(),
    prisma.sale.count({ where: { status: SaleStatus.PAID } }),
    prisma.sale.aggregate({
      where: { status: SaleStatus.PAID },
      _sum: { amountCents: true },
    }),
  ]);

  const [totalUsers, totalSales, totalRevenue] = stats;

  const cards = [
    {
      title: "Total de Usuários",
      value: totalUsers,
      description: "Usuários únicos capturados",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50"
    },
    {
      title: "Vendas Confirmadas",
      value: totalSales,
      description: "Transações pagas com sucesso",
      icon: CreditCard,
      color: "text-emerald-600",
      bg: "bg-emerald-50"
    },
    {
      title: "Receita Total",
      value: `R$ ${((totalRevenue._sum.amountCents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      description: "Faturamento bruto acumulado",
      icon: TrendingUp,
      color: "text-amber-600",
      bg: "bg-amber-50"
    }
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Visão Geral</h1>
        <p className="text-slate-500">Acompanhe o desempenho dos seus bots e vendas em tempo real.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
          >
            <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-slate-600">
                {card.title}
              </CardTitle>
              <div className={`${card.bg} ${card.color} p-2 rounded-lg`}>
                <card.icon className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold text-slate-900">{card.value}</div>
                <p className="text-xs text-slate-500 mt-1">{card.description}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border-none shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>Filtros de usuários por inatividade de compra.</CardDescription>
            </div>
            <Clock className="w-5 h-5 text-slate-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {[
              { label: "Sem compra (3 dias)", href: "/admin/users?filter=no_purchase_3d" },
              { label: "Sem compra (7 dias)", href: "/admin/users?filter=no_purchase_7d" },
              { label: "Sem compra (30 dias)", href: "/admin/users?filter=no_purchase_30d" },
            ].map((action, i) => (
              <Link key={i} href={action.href}>
                <Button variant="outline" className="border-slate-200 hover:bg-slate-50 hover:text-primary transition-all group">
                  {action.label}
                  <ArrowRight className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
