import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
    BusinessProfile,
    DeliveryType,
    PaymentMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import AssistantProfileForm from "@/components/dashboard/whatsapp/assistant-profile-form";
import QRConnection from "@/components/dashboard/qr-connection";
import ManualStoreStatusForm from "@/components/dashboard/whatsapp/manual-store-status-form";
import OperatingHoursForm from "@/components/dashboard/whatsapp/operating-hours-form";
import StoreCheckoutSettingsForm from "@/components/dashboard/whatsapp/store-checkout-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
    Clock3,
    MessageCircle,
    PlugZap,
    Settings2,
    Store,
    Trash2,
    Waves,
} from "lucide-react";
import {
    deleteWhatsappInstanceAction,
    updateAssistantProfileAction,
    updateManualStoreClosedAction,
    updateOperatingHoursAction,
    updateStoreCheckoutSettingsAction,
    updateWhatsappClosedMessageAction,
} from "./actions";
import {
    DEFAULT_CLOSE_TIME,
    DEFAULT_OPEN_TIME,
    DEFAULT_OPERATING_TIMEZONE,
    OperatingHourFormRow,
    WEEKDAY_OPTIONS,
} from "./operating-hours";
import {
    getBusinessProfileLabel,
    getDeliveryTypeLabel,
    getPaymentMethodLabel,
} from "./checkout-options";

function statusTone(status: string) {
    const normalized = status.toUpperCase();

    if (normalized === "CONNECTED") {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (normalized === "CONNECTING") {
        return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-slate-200 bg-slate-100 text-slate-700";
}

function formatCurrency(valueCents: number) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(valueCents / 100);
}

function formatCurrencyInput(valueCents: number) {
    return (valueCents / 100).toFixed(2).replace(".", ",");
}

export default async function DashboardWhatsappPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (session.user.isSuperAdmin) {
        redirect("/admin/dashboard");
    }

    const instances = await prisma.whatsappInstance.findMany({
        where: { userId: session.user.id },
        include: {
            _count: {
                select: {
                    orders: true,
                    handovers: true,
                },
            },
        },
        orderBy: { createdAt: "desc" },
    });

    const userSettings = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            assistantName: true,
            businessProfile: true,
            closedMessage: true,
            manualStoreClosed: true,
            deliveryFeeCents: true,
            storeAddress: true,
            acceptedPaymentMethods: true,
            availableDeliveryTypes: true,
            operatingHours: {
                orderBy: {
                    dayOfWeek: "asc",
                },
            },
        },
    });

    const operatingHoursMap = new Map(
        (userSettings?.operatingHours ?? []).map((item) => [
            item.dayOfWeek,
            item,
        ]),
    );

    const operatingHourRows: OperatingHourFormRow[] = WEEKDAY_OPTIONS.map(
        ({ dayOfWeek, label }) => {
            const existingHour = operatingHoursMap.get(dayOfWeek);

            return {
                dayOfWeek,
                label,
                openTime: existingHour?.openTime ?? DEFAULT_OPEN_TIME,
                closeTime: existingHour?.closeTime ?? DEFAULT_CLOSE_TIME,
                isOpen: existingHour?.isOpen ?? true,
            };
        },
    );

    const operatingTimezone =
        userSettings?.operatingHours.find((item) => item.timezone?.trim())
            ?.timezone ?? DEFAULT_OPERATING_TIMEZONE;

    const connectedCount = instances.filter(
        (instance) => instance.status.toUpperCase() === "CONNECTED",
    ).length;
    const totalInstances = instances.length;
    const disconnectedCount = instances.length - connectedCount;
    const totalHandovers = instances.reduce(
        (sum, instance) => sum + instance._count.handovers,
        0,
    );
    const managedInstanceName = `user_${session.user.id}`;
    const primaryInstance =
        instances.find(
            (instance) => instance.instanceName === managedInstanceName,
        ) ??
        instances[0] ??
        null;
    const manualStoreClosed = userSettings?.manualStoreClosed ?? false;
    const deliveryFeeCents = userSettings?.deliveryFeeCents ?? 0;
    const deliveryFeeLabel =
        deliveryFeeCents > 0 ? formatCurrency(deliveryFeeCents) : "Sem taxa";
    const assistantName = userSettings?.assistantName?.trim() || "Clara";
    const businessProfile =
        userSettings?.businessProfile ?? BusinessProfile.GROCERY;
    const businessProfileLabel = getBusinessProfileLabel(businessProfile);
    const storeAddress = userSettings?.storeAddress?.trim() ?? "";
    const savedAcceptedPaymentMethods =
        userSettings?.acceptedPaymentMethods ?? [];
    const savedAvailableDeliveryTypes =
        userSettings?.availableDeliveryTypes ?? [];
    const acceptedPaymentMethods = savedAcceptedPaymentMethods.length
        ? savedAcceptedPaymentMethods
        : [PaymentMethod.PIX_ONLINE, PaymentMethod.CASH];
    const availableDeliveryTypes = savedAvailableDeliveryTypes.length
        ? savedAvailableDeliveryTypes
        : [DeliveryType.DELIVERY];
    const paymentMethodsLabel = savedAcceptedPaymentMethods.length
        ? savedAcceptedPaymentMethods.map(getPaymentMethodLabel).join(", ")
        : "Ainda nao configurado";
    const deliveryTypesLabel = savedAvailableDeliveryTypes.length
        ? savedAvailableDeliveryTypes.map(getDeliveryTypeLabel).join(", ")
        : "Ainda nao configurado";
    const isStoreSetupReady = Boolean(
        assistantName.trim() &&
            storeAddress &&
            savedAcceptedPaymentMethods.length &&
            savedAvailableDeliveryTypes.length,
    );

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        Canal de atendimento
                    </p>
                    <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                        <MessageCircle className="h-7 w-7 text-primary" />
                        WhatsApp da loja
                    </h2>
                    <p className="max-w-2xl text-sm text-slate-500">
                        Painel compacto para conectar a loja, controlar pausas e
                        ajustar a automacao.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        variant={manualStoreClosed ? "destructive" : "outline"}
                    >
                        {manualStoreClosed
                            ? "Fechado manualmente"
                            : "Atendimento automatico"}
                    </Badge>
                    {primaryInstance ? (
                        <Badge
                            variant="outline"
                            className={statusTone(primaryInstance.status)}
                        >
                            {primaryInstance.status}
                        </Badge>
                    ) : null}
                    <Badge variant="outline">{managedInstanceName}</Badge>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="border-none shadow-sm">
                    <CardContent className="px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Instancias
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                            {totalInstances}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardContent className="px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Conectadas
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                            {connectedCount}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardContent className="px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Pendentes
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                            {disconnectedCount}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardContent className="px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Handovers
                        </p>
                        <p className="mt-1 text-2xl font-bold text-slate-900">
                            {totalHandovers}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.98fr)]">
                <div className="space-y-4">
                    <Card className="border-none shadow-sm">
                        <CardContent className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                        Instancia principal
                                    </p>
                                    <p className="font-semibold text-slate-900">
                                        {managedInstanceName}
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        O webhook tecnico continua configurado
                                        automaticamente no back-end.
                                    </p>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Prontidao da loja
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">
                                            {isStoreSetupReady
                                                ? "Loja pronta para vender"
                                                : "Falta ajustar checkout"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Pagamentos
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">
                                            {savedAcceptedPaymentMethods.length} metodo(s)
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:max-w-[220px] sm:justify-end">
                                <Badge
                                    variant={
                                        isStoreSetupReady
                                            ? "default"
                                            : "secondary"
                                    }
                                >
                                    {isStoreSetupReady
                                        ? "Setup completo"
                                        : "Setup pendente"}
                                </Badge>
                                <Badge variant="outline">
                                    {deliveryTypesLabel}
                                </Badge>
                                <Badge variant="outline">
                                    {deliveryFeeLabel}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <QRConnection
                        initialStatus={primaryInstance?.status ?? null}
                        setupDefaults={{
                            assistantName,
                            businessProfile,
                            storeAddress,
                            deliveryFee: formatCurrencyInput(
                                deliveryFeeCents,
                            ),
                            acceptedPaymentMethods,
                            availableDeliveryTypes,
                        }}
                        assistantProfileAction={updateAssistantProfileAction}
                        storeCheckoutAction={updateStoreCheckoutSettingsAction}
                    />
                </div>

                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Settings2 className="h-4 w-4 text-primary" />
                            Configuracoes da operacao
                        </CardTitle>
                        <CardDescription>
                            Use as abas para controlar a loja sem poluir a tela.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="store" className="gap-4">
                            <TabsList className="h-auto w-full justify-start gap-1 rounded-xl bg-slate-100 p-1">
                                <TabsTrigger value="store">
                                    <Store className="h-4 w-4" />
                                    Loja
                                </TabsTrigger>
                                <TabsTrigger value="message">
                                    <MessageCircle className="h-4 w-4" />
                                    Ausencia
                                </TabsTrigger>
                                <TabsTrigger value="hours">
                                    <Clock3 className="h-4 w-4" />
                                    Horarios
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="store" className="space-y-4">
                                <ManualStoreStatusForm
                                    defaultClosed={manualStoreClosed}
                                    action={updateManualStoreClosedAction}
                                />

                                <AssistantProfileForm
                                    defaultAssistantName={assistantName}
                                    defaultBusinessProfile={businessProfile}
                                    action={updateAssistantProfileAction}
                                />

                                <StoreCheckoutSettingsForm
                                    defaultStoreAddress={storeAddress}
                                    defaultDeliveryFee={formatCurrencyInput(
                                        deliveryFeeCents,
                                    )}
                                    defaultAcceptedPaymentMethods={
                                        acceptedPaymentMethods
                                    }
                                    defaultAvailableDeliveryTypes={
                                        availableDeliveryTypes
                                    }
                                    action={updateStoreCheckoutSettingsAction}
                                />

                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Atendente
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">
                                            {assistantName}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Perfil
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">
                                            {businessProfileLabel}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Endereco da loja
                                        </p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {storeAddress || "Ainda nao configurado"}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Timezone
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">
                                            {operatingTimezone}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Taxa de entrega
                                        </p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">
                                            {deliveryFeeLabel}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Pagamentos aceitos
                                        </p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {paymentMethodsLabel}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:col-span-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Modalidades ativas
                                        </p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {deliveryTypesLabel}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                            Mensagem padrao
                                        </p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {userSettings?.closedMessage?.trim()
                                                ? "Personalizada pelo assinante"
                                                : "Usando mensagem padrao do sistema"}
                                        </p>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="message" className="space-y-4">
                                <form
                                    action={updateWhatsappClosedMessageAction}
                                    className="space-y-3"
                                >
                                    <div className="space-y-2">
                                        <Label htmlFor="closedMessage">
                                            Mensagem de ausencia
                                        </Label>
                                        <Textarea
                                            id="closedMessage"
                                            name="closedMessage"
                                            rows={5}
                                            defaultValue={
                                                userSettings?.closedMessage ??
                                                "Ola! No momento estamos descansando para melhor atende-lo amanha as 08h."
                                            }
                                            placeholder="Digite a mensagem automatica para quando a loja estiver fechada"
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Button type="submit" size="sm">
                                            Salvar mensagem
                                        </Button>
                                        <p className="text-xs text-slate-500">
                                            Se deixar em branco, o sistema usa a
                                            mensagem padrao.
                                        </p>
                                    </div>
                                </form>
                            </TabsContent>

                            <TabsContent value="hours" className="space-y-4">
                                <OperatingHoursForm
                                    rows={operatingHourRows}
                                    timezone={operatingTimezone}
                                    action={updateOperatingHoursAction}
                                />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle className="text-base">
                                Instancias cadastradas
                            </CardTitle>
                            <CardDescription>
                                Visualizacao mais compacta das instancias e do
                                status de cada uma.
                            </CardDescription>
                        </div>
                        <Badge variant="outline">
                            {totalInstances} instancia(s)
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    {instances.length === 0 ? (
                        <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
                            <div className="rounded-full bg-white p-3 text-slate-500 shadow-sm">
                                <Waves className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-base font-semibold text-slate-900">
                                    Nenhuma instancia cadastrada
                                </p>
                                <p className="text-sm text-slate-500">
                                    Conecte o WhatsApp para iniciar a operacao
                                    da loja.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {instances.map((instance) => (
                                <div
                                    key={instance.id}
                                    className="grid gap-3 rounded-2xl border border-slate-200 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                                >
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex min-w-0 items-center gap-2 font-medium text-slate-900">
                                                <PlugZap className="h-4 w-4 shrink-0 text-primary" />
                                                <span className="truncate">
                                                    {instance.instanceName}
                                                </span>
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className={statusTone(
                                                    instance.status,
                                                )}
                                            >
                                                {instance.status}
                                            </Badge>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                            <span>
                                                {instance._count.orders} pedido(s)
                                            </span>
                                            <span>
                                                {instance._count.handovers} handover(s)
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:justify-end">
                                        <Badge variant="secondary">
                                            {instance._count.orders} pedidos
                                        </Badge>
                                        <Badge variant="secondary">
                                            {instance._count.handovers} handovers
                                        </Badge>
                                    </div>

                                    <form
                                        action={deleteWhatsappInstanceAction}
                                        className="lg:justify-self-end"
                                    >
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={instance.id}
                                        />
                                        <Button
                                            type="submit"
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Remover
                                        </Button>
                                    </form>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
