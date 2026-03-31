"use client";

import { useActionState, useEffect, useRef } from "react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    changePasswordAction,
    type ChangePasswordState,
} from "@/actions/change-password";

const initialState: ChangePasswordState = {
    error: null,
    success: null,
};

type ChangePasswordFormProps = {
    userEmail: string;
};

export function ChangePasswordForm({
    userEmail,
}: ChangePasswordFormProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const [state, submitAction, isPending] = useActionState(
        changePasswordAction,
        initialState,
    );

    useEffect(() => {
        if (state.success) {
            formRef.current?.reset();
        }
    }, [state.success]);

    return (
        <Card className="border-white/10 bg-white text-slate-900 shadow-xl shadow-black/5">
            <CardHeader className="space-y-2">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <CardTitle>Segurança de acesso</CardTitle>
                        <CardDescription>
                            Altere a senha do painel sem sair do fluxo atual.
                        </CardDescription>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Conta conectada:{" "}
                    <span className="font-medium text-slate-900">
                        {userEmail}
                    </span>
                </div>
            </CardHeader>

            <CardContent>
                <form ref={formRef} action={submitAction} className="space-y-5">
                    {(state.error || state.success) && (
                        <Alert
                            variant={state.error ? "destructive" : "default"}
                            className={
                                state.error
                                    ? ""
                                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                            }
                        >
                            <AlertTitle>
                                {state.error ? "Falha ao alterar senha" : "Senha atualizada"}
                            </AlertTitle>
                            <AlertDescription>
                                {state.error ?? state.success}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Senha atual</Label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                            <Input
                                id="currentPassword"
                                name="currentPassword"
                                type="password"
                                placeholder="Digite sua senha atual"
                                className="pl-10"
                                autoComplete="current-password"
                                required
                            />
                        </div>
                        {state.fieldErrors?.currentPassword?.[0] && (
                            <p className="text-sm text-red-600">
                                {state.fieldErrors.currentPassword[0]}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">Nova senha</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                <Input
                                    id="newPassword"
                                    name="newPassword"
                                    type="password"
                                    placeholder="Mínimo de 8 caracteres"
                                    className="pl-10"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                            {state.fieldErrors?.newPassword?.[0] && (
                                <p className="text-sm text-red-600">
                                    {state.fieldErrors.newPassword[0]}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">
                                Confirmar nova senha
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type="password"
                                    placeholder="Repita a nova senha"
                                    className="pl-10"
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                            {state.fieldErrors?.confirmPassword?.[0] && (
                                <p className="text-sm text-red-600">
                                    {state.fieldErrors.confirmPassword[0]}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            disabled={isPending}
                            className="min-w-44"
                        >
                            {isPending ? "Salvando..." : "Atualizar senha"}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
