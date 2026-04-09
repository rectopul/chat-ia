"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { OperatingHourFormRow } from "@/app/dashboard/whatsapp/operating-hours";
import TimezoneCombobox from "./timezone-combobox";

type OperatingHoursFormProps = {
    rows: OperatingHourFormRow[];
    timezone: string;
    action: (formData: FormData) => Promise<void>;
};

export default function OperatingHoursForm({
    rows,
    timezone,
    action,
}: OperatingHoursFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedTimezone, setSelectedTimezone] = useState(timezone);
    const [draftRows, setDraftRows] = useState(rows);

    function updateRow(
        dayOfWeek: number,
        patch: Partial<OperatingHourFormRow>,
    ) {
        setDraftRows((currentRows) =>
            currentRows.map((row) =>
                row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row,
            ),
        );
    }

    function handleSubmit() {
        setErrorMessage(null);

        startTransition(async () => {
            try {
                const formData = new FormData();

                formData.set("timezone", selectedTimezone);

                for (const row of draftRows) {
                    formData.set(`openTime_${row.dayOfWeek}`, row.openTime);
                    formData.set(`closeTime_${row.dayOfWeek}`, row.closeTime);

                    if (row.isOpen) {
                        formData.set(`isOpen_${row.dayOfWeek}`, "1");
                    }
                }

                await action(formData);
                router.refresh();
            } catch (error) {
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel salvar os horarios.",
                );
            }
        });
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-2">
                <Label htmlFor="timezone-trigger">Timezone</Label>
                <TimezoneCombobox
                    id="timezone-trigger"
                    value={selectedTimezone}
                    onChange={setSelectedTimezone}
                />
            </div>

            <div className="space-y-2">
                {draftRows.map((row) => (
                    <div
                        key={row.dayOfWeek}
                        className={cn(
                            "rounded-2xl border px-4 py-3 transition-colors",
                            row.isOpen
                                ? "border-emerald-200 bg-emerald-50/40"
                                : "border-slate-200 bg-slate-50",
                        )}
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-slate-900">
                                        {row.label}
                                    </p>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            row.isOpen
                                                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                                                : "border-slate-200 bg-white text-slate-600",
                                        )}
                                    >
                                        {row.isOpen ? "Aberto" : "Fechado"}
                                    </Badge>
                                </div>
                                <p className="text-xs text-slate-500">
                                    {row.isOpen
                                        ? "Recebendo mensagens nesse dia."
                                        : "Atendimento pausado nesse dia."}
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                                    Ativar
                                </span>
                                <Switch
                                    checked={row.isOpen}
                                    onCheckedChange={(checked) =>
                                        updateRow(row.dayOfWeek, {
                                            isOpen: checked,
                                        })
                                    }
                                    aria-label={`Ativar ${row.label}`}
                                    disabled={isPending}
                                />
                            </div>
                        </div>

                        <div
                            className={cn(
                                "mt-3 grid gap-3 sm:grid-cols-2",
                                !row.isOpen && "opacity-60",
                            )}
                        >
                            <div className="space-y-2">
                                <Label htmlFor={`openTime_${row.dayOfWeek}`}>
                                    Abre
                                </Label>
                                <Input
                                    id={`openTime_${row.dayOfWeek}`}
                                    type="time"
                                    value={row.openTime}
                                    disabled={isPending || !row.isOpen}
                                    onChange={(event) =>
                                        updateRow(row.dayOfWeek, {
                                            openTime: event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor={`closeTime_${row.dayOfWeek}`}>
                                    Fecha
                                </Label>
                                <Input
                                    id={`closeTime_${row.dayOfWeek}`}
                                    type="time"
                                    value={row.closeTime}
                                    disabled={isPending || !row.isOpen}
                                    onChange={(event) =>
                                        updateRow(row.dayOfWeek, {
                                            closeTime: event.target.value,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={isPending}
                >
                    <Clock3 className="mr-2 h-4 w-4" />
                    {isPending ? "Salvando horarios..." : "Salvar horarios"}
                </Button>
                <p className="text-xs text-slate-500">
                    Se um horario passar da meia-noite, use algo como 18:00 ate
                    02:00.
                </p>
            </div>

            {errorMessage ? (
                <p className="text-sm font-medium text-rose-600">
                    {errorMessage}
                </p>
            ) : null}
        </div>
    );
}
