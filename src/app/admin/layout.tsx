import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-indigo-900 text-white p-6 space-y-4">
        <h1 className="text-2xl font-bold mb-8">Bot Admin</h1>
        <nav className="flex flex-col gap-2">
          <Link href="/admin" className="p-2 hover:bg-indigo-800 rounded">
            Dashboard
          </Link>
          <Link href="/admin/users" className="p-2 hover:bg-indigo-800 rounded">
            Usuários
          </Link>
          <Link href="/admin/messages" className="p-2 hover:bg-indigo-800 rounded">
            Conteúdos
          </Link>
          <Link href="/admin/campaigns" className="p-2 hover:bg-indigo-800 rounded">
            Campanhas Timed
          </Link>
          <Link href="/admin/products" className="p-2 hover:bg-indigo-800 rounded">
            Produtos
          </Link>
          <Link href="/admin/sales" className="p-2 hover:bg-indigo-800 rounded">
            Vendas
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <header className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Painel de Controle</h2>
          <div className="flex items-center gap-4">
            <span>{session.user?.email}</span>
            <Link href="/api/auth/signout" className="text-sm text-red-600 hover:underline">
              Sair
            </Link>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
