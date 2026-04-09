"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type ManualStoreStatusFormProps = {
    defaultClosed: boolean;
    action: (formData: FormData) => Promise<void>;
};

export default function ManualStoreStatusForm({
    defaultClosed,
    action,
}: ManualStoreStatusFormProps) {
    const router = useRouter();
    const [manualStoreClosed, setManualStoreClosed] = useState(defaultClosed);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleCheckedChange(nextChecked: boolean) {
        if (
            nextChecked &&
            !window.confirm(
                "Confirma fechar o comercio manualmente agora?",
            )
        ) {
            return;
        }

        const previousValue = manualStoreClosed;
        setManualStoreClosed(nextChecked);
        setErrorMessage(null);

        startTransition(async () => {
            try {
                const formData = new FormData();

                if (nextChecked) {
                    formData.set("manualStoreClosed", "1");
                }

                await action(formData);
                router.refresh();
            } catch (error) {
                setManualStoreClosed(previousValue);
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel atualizar o status manual.",
                );
            }
        });
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="space-y-1">
                    <Label
                        htmlFor="manualStoreClosed"
                        className="text-sm font-medium text-slate-900"
                    >
                        Fechar comercio manualmente
                    </Label>
                    <p className="text-sm text-slate-500">
                        Ative para pausar o atendimento imediato por qualquer
                        motivo, mesmo dentro do horario normal.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge
                        variant={manualStoreClosed ? "destructive" : "outline"}
                    >
                        {manualStoreClosed ? "Fechado" : "Aberto"}
                    </Badge>
                    <Switch
                        id="manualStoreClosed"
                        checked={manualStoreClosed}
                        onCheckedChange={handleCheckedChange}
                        aria-label="Fechar comercio manualmente"
                        disabled={isPending}
                    />
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <p>
                    {isPending
                        ? "Atualizando status manual..."
                        : "Quando desativado, a loja segue apenas os horarios configurados."}
                </p>
                {errorMessage ? (
                    <p className="font-medium text-rose-600">{errorMessage}</p>
                ) : null}
            </div>
        </div>
    );
}
