import { prisma } from "@/lib/prisma";
import { SaleStatus } from "@prisma/client";

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded shadow-sm">
          <h3 className="text-gray-500 text-sm font-medium">Total de Usuários</h3>
          <p className="text-3xl font-bold">{totalUsers}</p>
        </div>
        <div className="bg-white p-6 rounded shadow-sm">
          <h3 className="text-gray-500 text-sm font-medium">Vendas Confirmadas</h3>
          <p className="text-3xl font-bold">{totalSales}</p>
        </div>
        <div className="bg-white p-6 rounded shadow-sm">
          <h3 className="text-gray-500 text-sm font-medium">Receita Total</h3>
          <p className="text-3xl font-bold">
            R$ {(totalRevenue._sum.amountCents || 0) / 100}
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Ações Rápidas</h3>
        <div className="flex gap-4">
          <a href="/admin/users?filter=no_purchase_3d" className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
            Sem compra (3 dias)
          </a>
          <a href="/admin/users?filter=no_purchase_7d" className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
            Sem compra (1 semana)
          </a>
          <a href="/admin/users?filter=no_purchase_30d" className="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
            Sem compra (1 mês)
          </a>
        </div>
      </div>
    </div>
  );
}
