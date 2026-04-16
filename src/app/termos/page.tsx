import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-slate-50 px-4 py-10">
            <div className="mx-auto max-w-3xl space-y-6">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/register">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar ao cadastro
                    </Link>
                </Button>

                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <CardTitle>Termos de uso</CardTitle>
                                <CardDescription>
                                    Versao resumida para aceite de cadastro.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm leading-6 text-slate-600">
                        <p>
                            Ao criar sua conta, voce concorda em utilizar a
                            plataforma de forma licita, mantendo seus dados de
                            acesso em seguranca e respeitando as politicas de uso
                            do sistema.
                        </p>
                        <p>
                            Voce tambem concorda que recursos de IA, mensageria,
                            cobranca e integracoes externas podem depender de
                            terceiros e estar sujeitos a limites tecnicos,
                            disponibilidade e regras especificas.
                        </p>
                        <p>
                            Este texto pode ser substituido futuramente pela
                            versao juridica definitiva da sua operacao sem mudar
                            o fluxo do cadastro.
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
