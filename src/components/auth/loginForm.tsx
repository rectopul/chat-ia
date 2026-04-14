"use client";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardFooter } from "@/components/ui/card";
import { actionLogin, type LoginPrevState } from "@/actions/login";
import { useRouter } from "next/navigation";

const initialState: LoginPrevState = {
    status: "idle",
    formError: null,
    fieldErrors: {},
    values: {
        email: "",
    },
};

export function LoginForm() {
    const router = useRouter();
    const [state, submitAction, isPending] = useActionState(
        actionLogin,
        initialState,
    );

    useEffect(() => {
        if (state?.status === "success") {
            router.push("/dashboard");
        }
    }, [state, router]);

    return (
        <form action={submitAction}>
            <CardContent className="space-y-4">
                {state.formError && (
                    <div className="p-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                        <div className="w-1 h-1 bg-red-600 rounded-full" />
                        {state.formError}
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                            id="email"
                            type="email"
                            name="email"
                            placeholder="admin@exemplo.com"
                            defaultValue={state.values.email}
                            className="pl-10 bg-slate-50/50 border-slate-200 focus:bg-white transition-colors"
                            aria-invalid={Boolean(state.fieldErrors.email)}
                            autoComplete="email"
                            required
                        />
                    </div>
                    {state.fieldErrors.email && (
                        <p className="text-xs font-medium text-red-600">
                            {state.fieldErrors.email}
                        </p>
                    )}
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="password">Senha</Label>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input
                            id="password"
                            type="password"
                            name="password"
                            placeholder="••••••••"
                            className="pl-10 bg-slate-50/50 border-slate-200 focus:bg-white transition-colors"
                            aria-invalid={Boolean(state.fieldErrors.password)}
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    {state.fieldErrors.password && (
                        <p className="text-xs font-medium text-red-600">
                            {state.fieldErrors.password}
                        </p>
                    )}
                </div>
            </CardContent>
            <CardFooter className="mt-4">
                <div className="w-full space-y-3">
                    <Button
                        type="submit"
                        disabled={isPending}
                        className="h-11 w-full bg-primary font-bold uppercase tracking-widest shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                    >
                        {isPending ? "Entrando..." : "Entrar no Painel"}
                    </Button>
                    <p className="text-center text-sm text-slate-500">
                        Ainda nao tem conta?{" "}
                        <Link
                            href="/register"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                            Criar cadastro
                        </Link>
                    </p>
                </div>
            </CardFooter>
        </form>
    );
}
