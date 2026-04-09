"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ProductCategoryComboboxProps = {
    categories: string[];
    value: string;
    onChange: (value: string) => void;
};

export function ProductCategoryCombobox({
    categories,
    value,
    onChange,
}: ProductCategoryComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const normalizedQuery = query.trim().toLowerCase();
    const filteredCategories = useMemo(
        () =>
            categories.filter((category) =>
                category.toLowerCase().includes(normalizedQuery),
            ),
        [categories, normalizedQuery],
    );
    const exactMatch = categories.some(
        (category) => category.toLowerCase() === normalizedQuery,
    );
    const canCreateCategory = Boolean(normalizedQuery) && !exactMatch;

    const selectCategory = (nextValue: string) => {
        onChange(nextValue.trim());
        setOpen(false);
        setQuery("");
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                >
                    <span
                        className={cn(
                            "truncate",
                            !value && "text-muted-foreground",
                        )}
                    >
                        {value || "Selecione ou crie uma categoria"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <div className="border-b p-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="pl-9"
                            placeholder="Buscar ou criar categoria"
                        />
                    </div>
                </div>

                <ScrollArea className="max-h-64">
                    <div className="p-1">
                        <button
                            type="button"
                            onClick={() => selectCategory("")}
                            className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                            <span className="text-muted-foreground">
                                Sem categoria
                            </span>
                            {!value && <Check className="h-4 w-4" />}
                        </button>

                        {filteredCategories.map((category) => (
                            <button
                                key={category}
                                type="button"
                                onClick={() => selectCategory(category)}
                                className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            >
                                <span className="truncate">{category}</span>
                                {value === category && <Check className="h-4 w-4" />}
                            </button>
                        ))}

                        {canCreateCategory && (
                            <button
                                type="button"
                                onClick={() => selectCategory(query)}
                                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                            >
                                <Plus className="h-4 w-4" />
                                Criar categoria&nbsp;
                                <span className="truncate">&quot;{query.trim()}&quot;</span>
                            </button>
                        )}

                        {!filteredCategories.length && !canCreateCategory && (
                            <div className="px-3 py-4 text-sm text-muted-foreground">
                                Nenhuma categoria encontrada.
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {value && (
                    <div className="border-t p-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => selectCategory("")}
                        >
                            <X className="h-4 w-4" />
                            Limpar categoria
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
