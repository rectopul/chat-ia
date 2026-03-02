import { prisma } from "@/lib/prisma";
import { subDays } from "date-fns";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const filter = (await searchParams).filter;
  let dateLimit: Date | null = null;

  if (filter === "no_purchase_3d") dateLimit = subDays(new Date(), 3);
  if (filter === "no_purchase_7d") dateLimit = subDays(new Date(), 7);
  if (filter === "no_purchase_30d") dateLimit = subDays(new Date(), 30);
  if (filter === "no_purchase_60d") dateLimit = subDays(new Date(), 60);

  let users;
  if (dateLimit) {
    users = await prisma.telegramUser.findMany({
      where: {
        sales: {
          none: {
            status: "PAID",
            paidAt: {
              gte: dateLimit,
            },
          },
        },
      },
      orderBy: { lastSeenAt: "desc" },
    });
  } else {
    users = await prisma.telegramUser.findMany({
      orderBy: { lastSeenAt: "desc" },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Usuários do Bot</h3>
        <div className="flex gap-2 text-sm">
          <span>Filtrar sem compra:</span>
          <a href="/admin/users" className={!filter ? "font-bold" : ""}>Todos</a>
          <a href="/admin/users?filter=no_purchase_3d" className={filter === "no_purchase_3d" ? "font-bold" : ""}>3d</a>
          <a href="/admin/users?filter=no_purchase_7d" className={filter === "no_purchase_7d" ? "font-bold" : ""}>7d</a>
          <a href="/admin/users?filter=no_purchase_30d" className={filter === "no_purchase_30d" ? "font-bold" : ""}>30d</a>
        </div>
      </div>

      <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">ID / Nome</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Telegram</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Visto em</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Assinante</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                  {user.firstName} {user.lastName} <br />
                  <span className="text-xs text-gray-500">{user.id}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  @{user.username || "n/a"} <br />
                  <span className="text-xs">{user.telegramUserId}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {user.lastSeenAt.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {user.isSubscriber ? "Sim" : "Não"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
