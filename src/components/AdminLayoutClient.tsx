"use client";

import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Bot,
    Calendar,
    Users,
    MessageSquare,
    Zap,
    ShoppingBag,
    CreditCard,
    Settings,
    LogOut,
    UserCircle,
    Menu,
    Clock,
    ArrowUpDown,
    Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { motion } from "framer-motion";

const navItems = [
    { href: "/admin/dashboard", label: "Dashboard SaaS", icon: LayoutDashboard },
    { href: "/admin/tenants", label: "Clientes SaaS", icon: UserCircle },
    { href: "/admin/bots", label: "Bots (Contas)", icon: Bot },
    { href: "/admin/schedules", label: "Agendamentos", icon: Calendar },
    { href: "/admin/users", label: "Leads Telegram", icon: Users },
    { href: "/admin/messages", label: "Conteúdos", icon: MessageSquare },
    { href: "/admin/campaigns", label: "Campanhas Timed", icon: Zap },
    { href: "/admin/products", label: "Produtos", icon: ShoppingBag },
    { href: "/admin/sales", label: "Vendas", icon: CreditCard },
    { href: "/admin/ai-usage", label: "Consumo IA", icon: Cpu },
    { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    {
        href: "/admin/dont-sell-intervals",
        label: "Configurações Dont Sell",
        icon: Clock,
    },
    {
        href: "/admin/scraping",
        label: "Transferencia de grupos",
        icon: ArrowUpDown,
    },
];

function AdminNavContent({
    pathname,
    session,
}: {
    pathname: string;
    session: Session;
}) {
    return (
        <div className="flex flex-col h-full">
            <div className="p-6">
                <div className="flex items-center gap-2 px-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-900">
                        Bot Admin
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2">
                <nav className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all group ${
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-primary"
                                }`}
                            >
                                <item.icon
                                    className={`w-4 h-4 ${isActive ? "text-primary" : "group-hover:text-primary"}`}
                                />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="p-4 border-t border-slate-200">
                <div className="flex items-center gap-3 px-3 py-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                        <UserCircle className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-medium text-slate-900 truncate">
                            {session.user?.email}
                        </span>
                        <span className="text-[10px] text-slate-500">
                            Administrador
                        </span>
                    </div>
                </div>
                <Link href="/api/auth/signout">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
                        size="sm"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sair
                    </Button>
                </Link>
            </div>
        </div>
    );
}

export default function AdminLayout({
    children,
    session,
}: {
    children: React.ReactNode;
    session: Session;
}) {
    const pathname = usePathname();
    const formattedDate = new Date().toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });

    return (
        <div className="flex min-h-screen bg-slate-50/50">
            {/* Desktop Sidebar */}
            <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 hidden md:flex flex-col z-20">
                <AdminNavContent pathname={pathname} session={session} />
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:pl-64 min-h-screen">
                <header className="sticky top-0 z-10 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 md:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="md:hidden"
                                >
                                    <Menu className="w-5 h-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0 w-64">
                                <SheetHeader className="sr-only">
                                    <SheetTitle>Navegação</SheetTitle>
                                </SheetHeader>
                                <AdminNavContent
                                    pathname={pathname}
                                    session={session}
                                />
                            </SheetContent>
                        </Sheet>
                        <h2 className="text-lg font-semibold text-slate-800">
                            Painel de Controle
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                        <span
                            suppressHydrationWarning
                            className="text-sm text-slate-500 hidden sm:block"
                        >
                            {formattedDate}
                        </span>
                    </div>
                </header>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="p-4 md:p-8"
                >
                    {children}
                </motion.div>
            </main>
        </div>
    );
}
