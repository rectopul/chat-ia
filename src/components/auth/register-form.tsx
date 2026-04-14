"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Mail, Phone, UserRound } from "lucide-react";
import { actionRegister, type RegisterPrevState } from "@/actions/register";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardFooter } from "@/components/ui/card";
import { formatPhoneMask } from "@/lib/phone";

const initialState: RegisterPrevState = {
    status: "idle",
    formError: null,
    fieldErrors: {},
    values: {
        name: "",
        email: "",
        phone: "",
        acceptTerms: false,
    },
};

type TermsCheckboxProps = {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    error?: string;
};

function TermsCheckbox({
    checked,
    onCheckedChange,
    error,
}: TermsCheckboxProps) {
    return (
        <div className="space-y-2">
            <label
                htmlFor="acceptTerms"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:border-primary/30 hover:bg-white"
            >
                <input
                    id="acceptTerms"
                    name="acceptTerms"
                    type="checkbox"
                    value="1"
                    checked={checked}
                    onChange={(event) =>
                        onCheckedChange(event.currentTarget.checked)
                    }
                    className="sr-only"
                />
                <span
                    className={[
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                        checked
                            ? "border-primary bg-primary text-white"
                            : "border-slate-300 bg-white text-transparent",
                    ].join(" ")}
                    aria-hidden="true"
                >
                    <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm leading-6 text-slate-600">
                    Li e aceito os{" "}
                    <Link
                        href="/termos"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                        termos de uso
                    </Link>{" "}
                    para criar minha conta de assinante.
                </span>
            </label>
            {error ? (
                <p className="text-xs font-medium text-red-600">{error}</p>
            ) : null}
        </div>
    );
}

export function RegisterForm() {
    const router = useRouter();
    const [state, submitAction, isPending] = useActionState(
        actionRegister,
        initialState,
    );
    const [phoneValue, setPhoneValue] = useState(initialState.values.phone);
    const [acceptTerms, setAcceptTerms] = useState(
        initialState.values.acceptTerms,
    );

    useEffect(() => {
        if (state.status === "success") {
            router.push("/dashboard");
        }
    }, [router, state.status]);

    return (
        <form action={submitAction}>
            <CardContent className="space-y-4">
                {state.formError ? (
                    <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-xs font-medium text-red-600 animate-in fade-in zoom-in duration-200">
                        <div className="h-1 w-1 rounded-full bg-red-600" />
                        {state.formError}
                    </div>
                ) : null}

                <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <div className="relative">
                        <UserRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                            id="name"
                            name="name"
                            placeholder="Seu nome ou nome da loja"
                            defaultValue={state.values.name}
                            className="border-slate-200 bg-slate-50/50 pl-10 transition-colors focus:bg-white"
                            aria-invalid={Boolean(state.fieldErrors.name)}
                            autoComplete="name"
                            required
                        />
                    </div>
                    {state.fieldErrors.name ? (
                        <p className="text-xs font-medium text-red-600">
                            {state.fieldErrors.name}
                        </p>
                    ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="email">E-mail</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input
                                id="email"
                                type="email"
                                name="email"
                                placeholder="voce@exemplo.com"
                                defaultValue={state.values.email}
                                className="border-slate-200 bg-slate-50/50 pl-10 transition-colors focus:bg-white"
                                aria-invalid={Boolean(state.fieldErrors.email)}
                                autoComplete="email"
                                required
                            />
                        </div>
                        {state.fieldErrors.email ? (
                            <p className="text-xs font-medium text-red-600">
                                {state.fieldErrors.email}
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">WhatsApp</Label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input
                                id="phone"
                                type="tel"
                                name="phone"
                                placeholder="(14) 99999-9999"
                                value={phoneValue}
                                onChange={(event) =>
                                    setPhoneValue(
                                        formatPhoneMask(event.target.value),
                                    )
                                }
                                className="border-slate-200 bg-slate-50/50 pl-10 transition-colors focus:bg-white"
                                aria-invalid={Boolean(state.fieldErrors.phone)}
                                autoComplete="tel"
                                inputMode="tel"
                                required
                            />
                        </div>
                        {state.fieldErrors.phone ? (
                            <p className="text-xs font-medium text-red-600">
                                {state.fieldErrors.phone}
                            </p>
                        ) : null}
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="password">Senha</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input
                                id="password"
                                type="password"
                                name="password"
                                placeholder="Crie uma senha forte"
                                className="border-slate-200 bg-slate-50/50 pl-10 transition-colors focus:bg-white"
                                aria-invalid={Boolean(state.fieldErrors.password)}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        <p className="text-xs text-slate-500">
                            Use pelo menos 8 caracteres com letra e numero.
                        </p>
                        {state.fieldErrors.password ? (
                            <p className="text-xs font-medium text-red-600">
                                {state.fieldErrors.password}
                            </p>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirmar senha</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input
                                id="confirmPassword"
                                type="password"
                                name="confirmPassword"
                                placeholder="Repita sua senha"
                                className="border-slate-200 bg-slate-50/50 pl-10 transition-colors focus:bg-white"
                                aria-invalid={Boolean(
                                    state.fieldErrors.confirmPassword,
                                )}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                        {state.fieldErrors.confirmPassword ? (
                            <p className="text-xs font-medium text-red-600">
                                {state.fieldErrors.confirmPassword}
                            </p>
                        ) : null}
                    </div>
                </div>

                <TermsCheckbox
                    checked={acceptTerms}
                    onCheckedChange={setAcceptTerms}
                    error={state.fieldErrors.acceptTerms}
                />
            </CardContent>

            <CardFooter className="mt-4 flex flex-col gap-3">
                <Button
                    type="submit"
                    disabled={isPending}
                    className="h-11 w-full bg-primary font-bold uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                >
                    {isPending ? "Criando conta..." : "Criar conta"}
                </Button>

                <p className="text-center text-sm text-slate-500">
                    Ja tem uma conta?{" "}
                    <Link
                        href="/login"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                        Entrar no painel
                    </Link>
                </p>
            </CardFooter>
        </form>
    );
}
