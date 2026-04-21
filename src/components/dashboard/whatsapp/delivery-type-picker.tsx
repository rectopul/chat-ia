"use client";

import { Store, Truck } from "lucide-react";
import { DeliveryType } from "@prisma/client";
import { cn } from "@/lib/utils";
import { DELIVERY_TYPE_OPTIONS } from "@/app/dashboard/whatsapp/checkout-options";

type DeliveryTypePickerProps = {
    value: DeliveryType[];
    onChange: (nextValue: DeliveryType[]) => void;
    disabled?: boolean;
};

const DELIVERY_TYPE_ICONS = {
    DELIVERY: Truck,
    PICKUP: Store,
} as const;

export default function DeliveryTypePicker({
    value,
    onChange,
    disabled = false,
}: DeliveryTypePickerProps) {
    function toggleDeliveryType(deliveryType: DeliveryType) {
        if (disabled) {
            return;
        }

        const isSelected = value.includes(deliveryType);

        if (isSelected) {
            onChange(value.filter((item) => item !== deliveryType));
            return;
        }

        onChange([...value, deliveryType]);
    }

    return (
        <div className="grid items-stretch gap-3 md:grid-cols-2">
            {DELIVERY_TYPE_OPTIONS.map((option) => {
                const Icon = DELIVERY_TYPE_ICONS[option.value];
                const selected = value.includes(option.value);

                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleDeliveryType(option.value)}
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
