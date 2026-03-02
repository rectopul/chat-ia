import { prisma } from "@/lib/prisma";

export default async function AdminSalesPage() {
  const sales = await prisma.sale.findMany({
    include: { user: true, product: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Histórico de Vendas</h3>

      <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Referência / Produto</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Usuário</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Valor</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sales.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                  <span className="font-mono text-xs">{s.referenceId}</span> <br />
                  {s.product.title}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    @{s.user.username || "n/a"} <br />
                    <span className="text-xs">{s.telegramUserId}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">R$ {s.amountCents / 100}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        s.status === 'PAID' ? 'bg-green-100 text-green-800' :
                        s.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                    }`}>
                        {s.status}
                    </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {s.createdAt.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
