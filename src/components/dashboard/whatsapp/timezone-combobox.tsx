"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TimezoneComboboxProps = {
    id?: string;
    value: string;
    onChange: (value: string) => void;
};

const FALLBACK_TIMEZONES = [
    "America/Sao_Paulo",
    "America/Manaus",
    "America/Belem",
    "America/Fortaleza",
    "America/Bahia",
    "America/Recife",
    "America/Campo_Grande",
    "America/Cuiaba",
    "America/Porto_Velho",
    "America/Rio_Branco",
    "America/Noronha",
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/Lisbon",
];

function loadTimezoneOptions() {
    if (
        typeof Intl !== "undefined" &&
        "supportedValuesOf" in Intl &&
        typeof Intl.supportedValuesOf === "function"
    ) {
        try {
            return Intl.supportedValuesOf("timeZone");
        } catch {
            return FALLBACK_TIMEZONES;
        }
    }

    return FALLBACK_TIMEZONES;
}

const TIMEZONE_OPTIONS = loadTimezoneOptions();

export default function TimezoneCombobox({
    id,
    value,
    onChange,
}: TimezoneComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const normalizedQuery = query.trim().toLowerCase();
    const filteredOptions = TIMEZONE_OPTIONS.filter((timezone) =>
        timezone.toLowerCase().includes(normalizedQuery),
    ).slice(0, 120);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                >
                    <span className="truncate">{value}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[340px] p-2">
                <div className="space-y-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Buscar timezone"
                            className="pl-9"
                        />
                    </div>
                    <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                        {filteredOptions.length === 0 ? (
                            <div className="rounded-lg px-3 py-6 text-center text-sm text-slate-500">
                                Nenhum timezone encontrado.
                            </div>
                        ) : (
                            filteredOptions.map((timezone) => {
                                const isSelected = timezone === value;

                                return (
                                    <button
                                        key={timezone}
                                        type="button"
                                        onClick={() => {
                                            onChange(timezone);
                                            setOpen(false);
                                            setQuery("");
                                        }}
                                        className={cn(
                                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                                            isSelected
                                                ? "bg-slate-900 text-white"
                                                : "hover:bg-slate-100",
                                        )}
                                    >
                                        <span className="truncate">
                                            {timezone}
                                        </span>
                                        <Check
                                            className={cn(
                                                "ml-3 h-4 w-4 shrink-0",
                                                isSelected
                                                    ? "opacity-100"
                                                    : "opacity-0",
                                            )}
                                        />
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
