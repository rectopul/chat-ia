import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import WhatsappStatusListener from "@/components/dashboard/whatsapp-status-listener";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Bike,
    Bot,
    LayoutDashboard,
    MessageCircle,
    MessageSquare,
    ShoppingBag,
    Users,
} from "lucide-react";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (session.user.isSuperAdmin) {
        redirect("/admin/dashboard");
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <WhatsappStatusListener userId={session.user.id} />
            <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                            User Panel
                        </p>
                        <h1 className="text-xl font-bold text-slate-900">
                            Painel do Cliente
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <Badge variant="outline">{session.user.planType || "SEM PLANO"}</Badge>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/billing">Billing</Link>
                        </Button>
                        <Button asChild size="sm">
                            <Link href="/api/auth/signout">Sair</Link>
                        </Button>
                    </div>
                </div>
            </header>
            <nav className="border-b border-slate-200 bg-white">
                <div className="mx-auto flex max-w-6xl gap-2 px-4 py-3">
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard">
                            <LayoutDashboard className="w-4 h-4 mr-2" />
                            Visao geral
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard/bots">
                            <Bot className="w-4 h-4 mr-2" />
                            Contas Telegram
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard/messages">
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Conteudos
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard/products">
                            <ShoppingBag className="w-4 h-4 mr-2" />
                            Produtos
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard/whatsapp">
                            <MessageCircle className="w-4 h-4 mr-2" />
                            WhatsApp
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard/customers">
                            <Users className="w-4 h-4 mr-2" />
                            Clientes
                        </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dashboard/orders">
                            <Bike className="w-4 h-4 mr-2" />
                            Pedidos
                        </Link>
                    </Button>
                </div>
            </nav>
            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </div>
    );
}
