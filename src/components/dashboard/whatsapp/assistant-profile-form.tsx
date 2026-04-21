"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BusinessProfile } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUSINESS_PROFILE_OPTIONS } from "@/app/dashboard/whatsapp/checkout-options";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type AssistantProfileFormProps = {
    defaultAssistantName: string;
    defaultBusinessProfile: BusinessProfile;
    action: (formData: FormData) => Promise<void>;
};

export default function AssistantProfileForm({
    defaultAssistantName,
    defaultBusinessProfile,
    action,
}: AssistantProfileFormProps) {
    const router = useRouter();
    const [assistantName, setAssistantName] = useState(defaultAssistantName);
    const [businessProfile, setBusinessProfile] = useState(
        defaultBusinessProfile,
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);

        startTransition(async () => {
            try {
                const formData = new FormData();
                formData.set("assistantName", assistantName);
                formData.set("businessProfile", businessProfile);
                await action(formData);
                router.refresh();
            } catch (error) {
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel salvar o perfil do atendente.",
                );
            }
        });
    }

    const selectedProfile =
        BUSINESS_PROFILE_OPTIONS.find(
            (option) => option.value === businessProfile,
        ) ?? BUSINESS_PROFILE_OPTIONS[0];

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
        >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
                <div className="space-y-2">
                    <Label htmlFor="assistantName">Nome do atendente</Label>
                    <Input
                        id="assistantName"
                        name="assistantName"
                        value={assistantName}
                        onChange={(event) =>
                            setAssistantName(event.target.value)
                        }
                        placeholder="Ex: Clara, Julia, Time da Loja"
                        disabled={isPending}
                        maxLength={80}
                    />
                    <p className="text-xs text-slate-500">
                        Esse nome aparece no contexto da IA e pode ser alterado
                        quando quiser.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="businessProfile">Perfil do negocio</Label>
                    <Select
                        value={businessProfile}
                        onValueChange={(value) =>
                            setBusinessProfile(value as BusinessProfile)
                        }
                        disabled={isPending}
                    >
                        <SelectTrigger
                            id="businessProfile"
                            className="w-full bg-white"
                        >
                            <SelectValue placeholder="Selecione o perfil" />
                        </SelectTrigger>
                        <SelectContent>
                            {BUSINESS_PROFILE_OPTIONS.map((option) => (
                                <SelectItem
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">
                        {selectedProfile.description}
                    </p>
                </div>

                <Button type="submit" size="sm" disabled={isPending}>
                    {isPending ? "Salvando..." : "Salvar perfil"}
                </Button>
            </div>

            {errorMessage ? (
                <p className="mt-3 text-sm font-medium text-rose-600">
                    {errorMessage}
                </p>
            ) : null}
        </form>
    );
}
