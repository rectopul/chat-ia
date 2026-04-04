"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Bot, LayoutDashboard, MessageSquare, ShoppingBag } from "lucide-react";

const navItems = [
    {
        href: "/dashboard",
        label: "Visao geral",
        icon: LayoutDashboard,
        match: (pathname: string) => pathname === "/dashboard",
    },
    {
        href: "/dashboard/bots",
        label: "Contas Telegram",
        icon: Bot,
        match: (pathname: string) => pathname.startsWith("/dashboard/bots"),
    },
    {
        href: "/dashboard/messages",
        label: "Conteudos",
        icon: MessageSquare,
        match: (pathname: string) => pathname.startsWith("/dashboard/messages"),
    },
    {
        href: "/dashboard/products",
        label: "Produtos",
        icon: ShoppingBag,
        match: (pathname: string) => pathname.startsWith("/dashboard/products"),
    },
];

export function UserDashboardNav() {
    const pathname = usePathname();

    return (
        <nav className="mx-auto max-w-6xl px-4">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-blue-100 bg-white p-2 shadow-lg shadow-blue-100/70">
                {navItems.map((item) => {
                    const isActive = item.match(pathname);

                    return (
                        <Button
                            key={item.href}
                            asChild
                            variant="ghost"
                            size="sm"
                            className={
                                isActive
                                    ? "bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                            }
                        >
                            <Link href={item.href}>
                                <item.icon className="mr-2 h-4 w-4" />
                                {item.label}
                            </Link>
                        </Button>
                    );
                })}
            </div>
        </nav>
    );
}
