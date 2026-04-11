"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProductsToolbarProps = {
    initialQuery: string;
};

const SEARCH_DEBOUNCE_MS = 450;

export function ProductsToolbar({ initialQuery }: ProductsToolbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(initialQuery);
    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        const nextQuery = deferredQuery.trim();
        const currentQuery = searchParams.get("q")?.trim() ?? "";

        if (nextQuery === currentQuery) {
            return;
        }

        const timeout = window.setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());

            if (nextQuery) {
                params.set("q", nextQuery);
            } else {
                params.delete("q");
            }

            params.set("page", "1");

            const nextUrl = params.toString()
                ? `${pathname}?${params.toString()}`
                : pathname;

            router.replace(nextUrl, { scroll: false });
        }, SEARCH_DEBOUNCE_MS);

        return () => window.clearTimeout(timeout);
    }, [deferredQuery, pathname, router, searchParams]);

    return (
        <div className="flex w-full flex-col gap-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar por nome, descricao, categoria ou tags"
                    className="h-11 rounded-xl border-slate-200 pl-10 pr-12"
                />
                {query ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-400"
                        onClick={() => setQuery("")}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>
            <p className="text-xs text-slate-500">
                Busca com debounce para evitar consultas desnecessarias no banco.
            </p>
        </div>
    );
}
