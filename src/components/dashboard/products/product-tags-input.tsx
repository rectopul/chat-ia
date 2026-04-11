"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, Tag as TagIcon, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type ProductTagOption = {
    id: string;
    name: string;
    productCount: number;
};

type ProductTagsInputProps = {
    availableTags: ProductTagOption[];
    value: string[];
    onChange: (value: string[]) => void;
};

function normalizeTagName(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function buildTagKey(value: string) {
    return normalizeTagName(value).toLocaleLowerCase("pt-BR");
}

export function ProductTagsInput({
    availableTags,
    value,
    onChange,
}: ProductTagsInputProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const selectedTagKeys = useMemo(
        () => new Set(value.map((tag) => buildTagKey(tag))),
        [value],
    );
    const normalizedQuery = normalizeTagName(query);
    const availableSuggestions = useMemo(
        () =>
            availableTags.filter((tag) => {
                const tagKey = buildTagKey(tag.name);

                if (selectedTagKeys.has(tagKey)) {
                    return false;
                }

                if (!normalizedQuery) {
                    return true;
                }

                return tag.name
                    .toLocaleLowerCase("pt-BR")
                    .includes(normalizedQuery.toLocaleLowerCase("pt-BR"));
            }),
        [availableTags, normalizedQuery, selectedTagKeys],
    );
    const canCreateTag =
        Boolean(normalizedQuery) && !selectedTagKeys.has(buildTagKey(normalizedQuery));

    const commitTag = (rawTagName: string) => {
        const tagName = normalizeTagName(rawTagName);

        if (!tagName) {
            return;
        }

        const nextValues = [...value];
        const nextKeys = new Set(nextValues.map((tag) => buildTagKey(tag)));
        const nextKey = buildTagKey(tagName);

        if (!nextKeys.has(nextKey)) {
            nextValues.push(tagName);
            onChange(nextValues);
        }

        setQuery("");
    };

    const removeTag = (tagName: string) => {
        const targetKey = buildTagKey(tagName);
        onChange(value.filter((tag) => buildTagKey(tag) !== targetKey));
    };

    return (
        <div className="space-y-3">
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
                                !value.length && "text-muted-foreground",
                            )}
                        >
                            {value.length
                                ? `${value.length} tag(s) selecionada(s)`
                                : "Selecionar ou criar tags"}
                        </span>
                        <TagIcon className="h-4 w-4 shrink-0 opacity-60" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[380px] p-0">
                    <div className="border-b p-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === "Enter" &&
                                        normalizeTagName(query)
                                    ) {
                                        event.preventDefault();
                                        commitTag(query);
                                    }
                                }}
                                className="pl-9"
                                placeholder="Buscar ou criar tag"
                            />
                        </div>
                    </div>

                    <ScrollArea className="max-h-64">
                        <div className="space-y-1 p-1 h-64">
                            {availableSuggestions.map((tag) => (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => commitTag(tag.name)}
                                    className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                >
                                    <span className="truncate">{tag.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            {tag.productCount} produto(s)
                                        </span>
                                        <Check className="h-4 w-4 opacity-0" />
                                    </div>
                                </button>
                            ))}

                            {canCreateTag && (
                                <button
                                    type="button"
                                    onClick={() => commitTag(query)}
                                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
                                >
                                    <Plus className="h-4 w-4" />
                                    Criar tag&nbsp;
                                    <span className="truncate">
                                        &quot;{normalizeTagName(query)}&quot;
                                    </span>
                                </button>
                            )}

                            {!availableSuggestions.length && !canCreateTag && (
                                <div className="px-3 py-4 text-sm text-muted-foreground">
                                    Nenhuma tag encontrada.
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>

            <div className="flex min-h-10 flex-wrap gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3">
                {value.length ? (
                    value.map((tag) => (
                        <Badge
                            key={buildTagKey(tag)}
                            variant="secondary"
                            className="gap-1.5 rounded-full px-3 py-1"
                        >
                            <span>{tag}</span>
                            <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="rounded-full text-slate-500 transition hover:text-slate-900"
                                aria-label={`Remover tag ${tag}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Adicione tags como churrasco, saudavel, zero acucar ou
                        premium para ajudar nas buscas e recomendacoes da IA.
                    </p>
                )}
            </div>
        </div>
    );
}
