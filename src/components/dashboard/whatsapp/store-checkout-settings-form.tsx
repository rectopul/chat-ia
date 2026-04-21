"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeliveryType, PaymentMethod } from "@prisma/client";
import { MapPinned, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DeliveryTypePicker from "./delivery-type-picker";
import PaymentMethodPicker from "./payment-method-picker";
import {
    getDeliveryTypeLabel,
    getPaymentMethodLabel,
} from "@/app/dashboard/whatsapp/checkout-options";

type StoreCheckoutSettingsFormProps = {
    defaultStoreAddress: string;
    defaultDeliveryFee: string;
    defaultAcceptedPaymentMethods: PaymentMethod[];
    defaultAvailableDeliveryTypes: DeliveryType[];
    action: (formData: FormData) => Promise<void>;
};

export default function StoreCheckoutSettingsForm({
    defaultStoreAddress,
    defaultDeliveryFee,
    defaultAcceptedPaymentMethods,
    defaultAvailableDeliveryTypes,
    action,
}: StoreCheckoutSettingsFormProps) {
    const router = useRouter();
    const [storeAddress, setStoreAddress] = useState(defaultStoreAddress);
    const [deliveryFee, setDeliveryFee] = useState(defaultDeliveryFee);
    const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState(
        defaultAcceptedPaymentMethods,
    );
    const [availableDeliveryTypes, setAvailableDeliveryTypes] = useState(
        defaultAvailableDeliveryTypes,
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const paymentSummary = useMemo(
        () =>
            acceptedPaymentMethods.length
                ? acceptedPaymentMethods.map(getPaymentMethodLabel).join(" • ")
                : "Nenhum metodo selecionado",
        [acceptedPaymentMethods],
    );
    const deliverySummary = useMemo(
        () =>
            availableDeliveryTypes.length
                ? availableDeliveryTypes.map(getDeliveryTypeLabel).join(" • ")
                : "Nenhuma opcao selecionada",
        [availableDeliveryTypes],
    );

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);

        startTransition(async () => {
            try {
                const formData = new FormData();
                formData.set("storeAddress", storeAddress);
                formData.set("deliveryFee", deliveryFee);

                for (const paymentMethod of acceptedPaymentMethods) {
                    formData.append("acceptedPaymentMethods", paymentMethod);
                }

                for (const deliveryType of availableDeliveryTypes) {
                    formData.append("availableDeliveryTypes", deliveryType);
                }

                await action(formData);
                router.refresh();
            } catch (error) {
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel salvar as configuracoes da loja.",
                );
            }
        });
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
        >
            {/* Header compacto */}
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,1),rgba(30,41,59,0.92))] px-5 py-4 text-white">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                            <ReceiptText className="h-3.5 w-3.5" />
                            Checkout
                        </div>
                        <h3 className="text-base font-semibold tracking-tight">
                            Entrega, retirada e pagamento
                        </h3>
                        <p className="text-xs leading-5 text-slate-300">
                            Configure os meios de recebimento da loja
                        </p>
                    </div>

                    {/* Indicadores compactos */}
                    <div className="hidden flex-shrink-0 gap-1.5 text-[10px] md:flex md:flex-col">
                        <div className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5">
                            <span className="font-semibold text-white">
                                {acceptedPaymentMethods.length}
                            </span>{" "}
                            <span className="text-slate-300">métodos</span>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5">
                            <span className="font-semibold text-white">
                                {availableDeliveryTypes.length}
                            </span>{" "}
                            <span className="text-slate-300">entregas</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Conteúdo principal */}
            <div className="space-y-4 p-5">
                {/* Endereço da loja */}
                <div className="space-y-2">
                    <Label
                        htmlFor="storeAddress"
                        className="text-sm font-medium"
                    >
                        Endereco da loja
                    </Label>
                    <Textarea
                        id="storeAddress"
                        name="storeAddress"
                        rows={3}
                        value={storeAddress}
                        onChange={(event) =>
                            setStoreAddress(event.target.value)
                        }
                        disabled={isPending}
                        placeholder="Ex: Rua Joaquim Fernandes Meira, 14, Centro"
                        className="resize-none text-sm"
                    />
                    <p className="text-[11px] leading-5 text-slate-500">
                        Usado no fluxo de retirada e confirmação de dados
                    </p>
                </div>

                {/* Grid para Taxa + Modalidades em telas maiores */}
                <div className="grid gap-4 md:grid-cols-2">
                    {/* Taxa de entrega */}
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2.5">
                            <div className="rounded-lg bg-white p-1.5 text-primary shadow-sm">
                                <MapPinned className="h-3.5 w-3.5" />
                            </div>
                            <Label
                                htmlFor="deliveryFee"
                                className="text-sm font-medium"
                            >
                                Taxa de entrega
                            </Label>
                        </div>
                        <Input
                            id="deliveryFee"
                            name="deliveryFee"
                            className="bg-white"
                            inputMode="decimal"
                            value={deliveryFee}
                            onChange={(event) =>
                                setDeliveryFee(event.target.value)
                            }
                            placeholder="Ex: 6,00"
                            disabled={isPending}
                        />
                        <p className="text-[11px] leading-5 text-slate-500">
                            Valor fixo para delivery (use 0 para gratuito)
                        </p>
                    </div>

                    {/* Modalidades disponíveis */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium">
                                Modalidades
                            </Label>
                            <Badge variant="outline" className="text-[10px]">
                                {availableDeliveryTypes.length}
                            </Badge>
                        </div>
                        <DeliveryTypePicker
                            value={availableDeliveryTypes}
                            onChange={setAvailableDeliveryTypes}
                            disabled={isPending}
                        />
                    </div>
                </div>

                {/* Métodos de pagamento */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">
                            Metodos de pagamento
                        </Label>
                        <Badge variant="outline" className="text-[10px]">
                            {acceptedPaymentMethods.length}
                        </Badge>
                    </div>
                    <PaymentMethodPicker
                        value={acceptedPaymentMethods}
                        onChange={setAcceptedPaymentMethods}
                        disabled={isPending}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-2.5 border-t border-slate-200 bg-gradient-to-b from-slate-50/50 to-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] leading-5 text-slate-500">
                    A IA oferece apenas as opções marcadas
                </p>
                <Button
                    type="submit"
                    disabled={isPending}
                    size="sm"
                    className="sm:flex-shrink-0"
                >
                    {isPending ? "Salvando..." : "Salvar configurações"}
                </Button>
            </div>

            {/* Mensagem de erro */}
            {errorMessage ? (
                <div className="border-t border-rose-100 bg-rose-50 px-5 py-3">
                    <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-rose-600">
                            <span className="text-[10px] font-bold text-white">
                                !
                            </span>
                        </div>
                        <p className="text-xs font-medium text-rose-700">
                            {errorMessage}
                        </p>
                    </div>
                </div>
            ) : null}
        </form>
    );
}
