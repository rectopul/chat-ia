"use client";
export const runtime = "nodejs";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Bot, Lock, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        if (result?.error) {
            setError("Email ou senha inválidos");
        } else {
            router.push("/admin");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-[400px] space-y-8">
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                        <Bot className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bot Admin Pro</h1>
                    <p className="text-sm text-slate-500 text-balance">
                        Entre com suas credenciais para gerenciar seus bots e campanhas.
                    </p>
                </div>

                <Card className="border-none shadow-xl shadow-slate-200/50">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-xl">Login</CardTitle>
                        <CardDescription>
                            Acesse o painel administrativo
                        </CardDescription>
                    </CardHeader>
                    <form onSubmit={handleSubmit}>
                        <CardContent className="space-y-4">
                            {error && (
                                <div className="p-3 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                    <div className="w-1 h-1 bg-red-600 rounded-full" />
                                    {error}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="email">E-mail</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="admin@exemplo.com"
                                        className="pl-10 bg-slate-50/50 border-slate-200 focus:bg-white transition-colors"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
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
                                        placeholder="••••••••"
                                        className="pl-10 bg-slate-50/50 border-slate-200 focus:bg-white transition-colors"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full h-11 font-bold uppercase tracking-widest bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                            >
                                Entrar no Painel
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <p className="text-center text-xs text-slate-400">
                    &copy; {new Date().getFullYear()} Bot Admin SaaS. Todos os direitos reservados.
                </p>
            </div>
        </div>
    );
}
