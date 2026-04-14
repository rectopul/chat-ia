"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DeliveryFeeFormProps = {
    defaultValue: string;
    currentFeeLabel: string;
    action: (formData: FormData) => Promise<void>;
};

export default function DeliveryFeeForm({
    defaultValue,
    currentFeeLabel,
    action,
}: DeliveryFeeFormProps) {
    const router = useRouter();
    const [deliveryFee, setDeliveryFee] = useState(defaultValue);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);

        startTransition(async () => {
            try {
                const formData = new FormData();
                formData.set("deliveryFee", deliveryFee);
                await action(formData);
                router.refresh();
            } catch (error) {
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel salvar a taxa de entrega.",
                );
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Label
                            htmlFor="deliveryFee"
                            className="text-sm font-medium text-slate-900"
                        >
                            Taxa de entrega
                        </Label>
                        <Badge variant="outline">{currentFeeLabel}</Badge>
                    </div>
                    <p className="text-sm text-slate-500">
                        Defina um valor fixo para ser somado aos pedidos do
                        delivery. Deixe 0 para nao cobrar taxa.
                    </p>
                </div>

                <div className="w-full max-w-xs space-y-2">
                    <Input
                        id="deliveryFee"
                        name="deliveryFee"
                        inputMode="decimal"
                        value={deliveryFee}
                        onChange={(event) => setDeliveryFee(event.target.value)}
                        placeholder="Ex: 6,00"
                        disabled={isPending}
                    />
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">
                            Aceita formatos como 6,00 ou 6.00.
                        </p>
                        <Button type="submit" size="sm" disabled={isPending}>
                            {isPending ? "Salvando..." : "Salvar taxa"}
                        </Button>
                    </div>
                </div>
            </div>

            {errorMessage ? (
                <p className="mt-3 text-sm font-medium text-rose-600">
                    {errorMessage}
                </p>
            ) : null}
        </form>
    );
}
