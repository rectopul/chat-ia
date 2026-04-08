import { Bot } from "lucide-react";
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/loginForm";

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-100 space-y-8">
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                        <Bot className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Bot Admin Pro
                    </h1>
                    <p className="text-sm text-slate-500 text-balance">
                        Entre com suas credenciais para gerenciar sua operacao,
                        pedidos e automacoes.
                    </p>
                </div>

                <Card className="border-none shadow-xl shadow-slate-200/50">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-xl">Login</CardTitle>
                        <CardDescription>
                            Acesse o painel da sua conta
                        </CardDescription>
                    </CardHeader>
                    <LoginForm />
                </Card>

                <p className="text-center text-xs text-slate-400">
                    &copy; {new Date().getFullYear()} Bot Admin SaaS. Todos os
                    direitos reservados.
                </p>
            </div>
        </div>
    );
}
