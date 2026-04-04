import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserWithSaasContext } from "@/lib/saas/server";
import { getPlanCatalog } from "@/lib/saas/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { PlanType, TransactionStatus } from "@prisma/client";
import { ArrowLeft, CreditCard, ShieldCheck } from "lucide-react";
import { activateFreePlanAction, checkoutPlanAction } from "./actions";

type SearchParams = Promise<{ checkout?: string }>;

function formatMoney(valueCents: number) {
    return `R$ ${(valueCents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
    })}`;
}

export default async function BillingPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (session.user.isSuperAdmin) {
        redirect("/admin/dashboard");
    }

    const user = await getUserWithSaasContext(session.user.id);

    if (!user) {
        redirect("/login");
    }

    const params = await searchParams;
    const checkout = params.checkout
        ? user.transactions.find(
              (transaction) => transaction.id === params.checkout,
          ) ?? null
        : null;
    const checkoutPix =
        checkout?.status === TransactionStatus.PENDING &&
        checkout.rawPayload &&
        typeof checkout.rawPayload === "object" &&
        "pix_code" in checkout.rawPayload
            ? checkout.rawPayload.pix_code
            : null;
    const plans = getPlanCatalog();

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-10">
            <div className="mx-auto max-w-6xl space-y-8">
                <div className="space-y-4">
                    <Button asChild variant="outline" className="border-blue-200 text-blue-700">
                        <Link href="/dashboard">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Voltar ao painel
                        </Link>
                    </Button>

                    <div className="rounded-3xl bg-linear-to-r from-blue-700 via-blue-600 to-cyan-500 p-6 text-white shadow-xl shadow-blue-200/70">
                        <Badge className="w-fit border-white/20 bg-white/15 text-white">
                            Billing
                        </Badge>
                        <h1 className="mt-3 text-4xl font-bold tracking-tight">
                            Escolha o plano do seu tenant
                        </h1>
                        <p className="mt-2 max-w-2xl text-blue-100">
                            Ative o plano que faz sentido para a sua operacao. O
                            acesso do painel e da IA passa a obedecer a assinatura
                            escolhida.
                        </p>
                    </div>
                </div>

                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                            <CardTitle>Assinatura atual</CardTitle>
                        </div>
                        <CardDescription>
                            Estado atual do seu acesso e do grace period.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-3">
                        <Badge variant="secondary">
                            {user.subscription?.planType || "SEM PLANO"}
                        </Badge>
                        <Badge variant="outline">
                            {user.subscription?.status || "SEM ASSINATURA"}
                        </Badge>
                        {user.subscription?.graceUntil && (
                            <span className="text-sm text-slate-500">
                                Grace period ate{" "}
                                {user.subscription.graceUntil.toLocaleDateString(
                                    "pt-BR",
                                )}
                            </span>
                        )}
                    </CardContent>
                </Card>

                {checkoutPix && (
                    <Card className="border-none shadow-sm">
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-primary" />
                                <CardTitle>PIX copia e cola</CardTitle>
                            </div>
                            <CardDescription>
                                Envie este codigo para pagamento do plano
                                selecionado.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-700 break-all">
                                {checkoutPix}
                            </div>
                            <p className="text-sm text-slate-500">
                                Assim que o gateway confirmar o pagamento, a
                                assinatura sera atualizada automaticamente pelo
                                webhook.
                            </p>
                        </CardContent>
                    </Card>
                )}

                <div className="grid gap-4 lg:grid-cols-4">
                    {plans.map((plan) => {
                        const isCurrentPlan =
                            user.subscription?.planType === plan.planType &&
                            user.subscription?.status === "ACTIVE";

                        return (
                            <Card
                                key={plan.planType}
                                className="border-none shadow-sm bg-white"
                            >
                                <CardHeader>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <CardTitle>{plan.name}</CardTitle>
                                            <CardDescription className="mt-1">
                                                {plan.description}
                                            </CardDescription>
                                        </div>
                                        <Badge variant="outline">
                                            {plan.priceCents === 0
                                                ? "Gratis"
                                                : formatMoney(plan.priceCents)}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ul className="space-y-2 text-sm text-slate-600">
                                        {plan.features.map((feature) => (
                                            <li key={feature}>{feature}</li>
                                        ))}
                                    </ul>
                                    <form
                                        action={
                                            plan.planType === PlanType.FREE
                                                ? activateFreePlanAction
                                                : checkoutPlanAction
                                        }
                                    >
                                        {plan.planType !== PlanType.FREE && (
                                            <input
                                                type="hidden"
                                                name="planType"
                                                value={plan.planType}
                                            />
                                        )}
                                        <Button
                                            type="submit"
                                            className="w-full"
                                            variant={isCurrentPlan ? "outline" : "default"}
                                            disabled={isCurrentPlan}
                                        >
                                            {isCurrentPlan
                                                ? "Plano atual"
                                                : plan.ctaLabel}
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
