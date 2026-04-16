import { Bot, CheckCircle2, MessageCircle, ShoppingBag, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RegisterForm } from "@/components/auth/register-form";

const highlights = [
    {
        icon: MessageCircle,
        title: "Atendimento no WhatsApp",
        description: "Conecte sua loja e automatize o fluxo de pedidos.",
    },
    {
        icon: ShoppingBag,
        title: "Catalogo organizado",
        description: "Cadastre produtos, categorias, tags e ofertas.",
    },
    {
        icon: Sparkles,
        title: "IA pronta para vender",
        description: "Use respostas guiadas para acelerar o atendimento.",
    },
];

export default async function RegisterPage() {
    const session = await auth();

    if (session?.user?.id) {
        redirect("/dashboard");
    }

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center">
                <section className="space-y-6">
                    <Badge
                        variant="outline"
                        className="w-fit border-primary/20 bg-primary/5 text-primary"
                    >
                        Cadastro de assinantes
                    </Badge>

                    <div className="space-y-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                            <Bot className="h-7 w-7" />
                        </div>
                        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-slate-900">
                            Crie sua conta e comece a operar seu painel de atendimento
                        </h1>
                        <p className="max-w-2xl text-base text-slate-500">
                            O mesmo ambiente do painel do assinante, com cadastro
                            direto, validacao em tempo real e entrada imediata no
                            plano inicial.
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        {highlights.map((item) => (
                            <Card
                                key={item.title}
                                className="border-none bg-white shadow-sm"
                            >
                                <CardHeader className="space-y-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-primary">
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <CardTitle className="text-base">
                                            {item.title}
                                        </CardTitle>
                                        <CardDescription>
                                            {item.description}
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                            </Card>
                        ))}
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <div className="space-y-1">
                                <p className="font-medium text-slate-900">
                                    O que voce recebe ao entrar
                                </p>
                                <p className="text-sm text-slate-500">
                                    Conta pronta para configurar catalogo, horarios,
                                    WhatsApp, clientes e pedidos em um so painel.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <Card className="border-none bg-white shadow-xl shadow-slate-200/50">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-2xl">Criar conta</CardTitle>
                        <CardDescription>
                            Preencha seus dados para acessar o painel do assinante.
                        </CardDescription>
                    </CardHeader>
                    <RegisterForm />
                </Card>
            </div>
        </div>
    );
}
