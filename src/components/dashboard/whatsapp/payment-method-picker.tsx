"use client";

import {
    CreditCard,
    HandCoins,
    type LucideIcon,
    QrCode,
    Wallet,
} from "lucide-react";
import { PaymentMethod } from "@prisma/client";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_OPTIONS } from "@/app/dashboard/whatsapp/checkout-options";

type PaymentMethodPickerProps = {
    value: PaymentMethod[];
    onChange: (nextValue: PaymentMethod[]) => void;
    disabled?: boolean;
};

const PAYMENT_METHOD_ICONS: Record<
    PaymentMethod,
    LucideIcon
> = {
    PIX_ONLINE: QrCode,
    PIX_DELIVERY: Wallet,
    CARD_DELIVERY: CreditCard,
    CASH: HandCoins,
};

export default function PaymentMethodPicker({
    value,
    onChange,
    disabled = false,
}: PaymentMethodPickerProps) {
    function togglePaymentMethod(paymentMethod: PaymentMethod) {
        if (disabled) {
            return;
        }

        const isSelected = value.includes(paymentMethod);

        if (isSelected) {
            onChange(value.filter((item) => item !== paymentMethod));
            return;
        }

        onChange([...value, paymentMethod]);
    }

    return (
        <div className="grid items-stretch gap-3 md:grid-cols-2">
            {PAYMENT_METHOD_OPTIONS.map((option) => {
                const Icon = PAYMENT_METHOD_ICONS[option.value];
                const selected = value.includes(option.value);

                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => togglePaymentMethod(option.value)}
                        disabled={disabled}
                        className={cn(
                            "flex h-full w-full min-w-0 rounded-2xl border px-4 py-3 text-left transition-all",
                            selected
                                ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/15"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                            disabled && "cursor-not-allowed opacity-70",
                        )}
                        aria-pressed={selected}
                    >
                        <div className="grid min-w-0 flex-1 grid-cols-[auto,minmax(0,1fr)] items-start gap-3">
                            <div
                                className={cn(
                                    "rounded-2xl p-2",
                                    selected
                                        ? "bg-primary text-white"
                                        : "bg-slate-100 text-slate-500",
                                )}
                            >
                                <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 space-y-1">
                                <p className="break-words text-sm font-semibold text-slate-900">
                                    {option.label}
                                </p>
                                <p className="break-words text-xs leading-5 text-slate-500">
                                    {option.description}
                                </p>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
