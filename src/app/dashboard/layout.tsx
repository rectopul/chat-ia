import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserDashboardNav } from "@/components/UserDashboardNav";
import { CreditCard, LogOut } from "lucide-react";

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
        <div className="min-h-screen bg-slate-100">
            <div className="border-b border-blue-300/30 bg-linear-to-r from-blue-700 via-blue-600 to-cyan-500">
                <header className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-100/90">
                            User Panel
                        </p>
                        <h1 className="text-2xl font-bold text-white">
                            Painel do Cliente
                        </h1>
                        <p className="mt-1 text-sm text-blue-100/90">
                            Gerencie suas contas, mensagens e assinatura em um so lugar.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className="border-white/30 bg-white/15 text-white hover:bg-white/20">
                            {session.user.planType || "SEM PLANO"}
                        </Badge>
                        <Button
                            asChild
                            size="sm"
                            className="bg-white/20 text-white shadow-none hover:bg-white/30"
                        >
                            <Link href="/billing">
                                <CreditCard className="mr-2 h-4 w-4" />
                                Billing
                            </Link>
                        </Button>
                        <Button
                            asChild
                            size="sm"
                            className="bg-white text-blue-700 hover:bg-blue-50"
                        >
                            <Link href="/api/auth/signout">
                                <LogOut className="mr-2 h-4 w-4" />
                                Sair
                            </Link>
                        </Button>
                    </div>
                </header>
            </div>

            <div className="-mt-4">
                <UserDashboardNav />
            </div>

            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </div>
    );
}
