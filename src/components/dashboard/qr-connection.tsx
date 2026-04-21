"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BusinessProfile, DeliveryType, PaymentMethod } from "@prisma/client";
import { toast } from "sonner";
import {
    CheckCircle2,
    Loader2,
    MapPinned,
    QrCode,
    RefreshCcw,
    Settings2,
    ShieldCheck,
    Smartphone,
    WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    BUSINESS_PROFILE_OPTIONS,
    getDeliveryTypeLabel,
    getPaymentMethodLabel,
} from "@/app/dashboard/whatsapp/checkout-options";
import DeliveryTypePicker from "./whatsapp/delivery-type-picker";
import PaymentMethodPicker from "./whatsapp/payment-method-picker";
import { ScrollArea } from "../ui/scroll-area";

type QRConnectionProps = {
    initialStatus: string | null;
    setupDefaults: {
        assistantName: string;
        businessProfile: BusinessProfile;
        storeAddress: string;
        deliveryFee: string;
        acceptedPaymentMethods: PaymentMethod[];
        availableDeliveryTypes: DeliveryType[];
    };
    assistantProfileAction: (formData: FormData) => Promise<void>;
    storeCheckoutAction: (formData: FormData) => Promise<void>;
};

type QrCodePayload = {
    instanceId: string;
    instanceName: string;
    status: string;
    qrCodeBase64: string | null;
    pairingCode: string | null;
};

const POLLING_INTERVAL_MS = 5000;

export default function QRConnection({
    initialStatus,
    setupDefaults,
    assistantProfileAction,
    storeCheckoutAction,
}: QRConnectionProps) {
    const router = useRouter();
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState(initialStatus?.toLowerCase() ?? null);
    const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [instanceName, setInstanceName] = useState<string | null>(null);
    const [assistantName, setAssistantName] = useState(
        setupDefaults.assistantName,
    );
    const [businessProfile, setBusinessProfile] = useState(
        setupDefaults.businessProfile,
    );
    const [storeAddress, setStoreAddress] = useState(
        setupDefaults.storeAddress,
    );
    const [deliveryFee, setDeliveryFee] = useState(setupDefaults.deliveryFee);
    const [acceptedPaymentMethods, setAcceptedPaymentMethods] = useState(
        setupDefaults.acceptedPaymentMethods,
    );
    const [availableDeliveryTypes, setAvailableDeliveryTypes] = useState(
        setupDefaults.availableDeliveryTypes,
    );
    const [setupError, setSetupError] = useState<string | null>(null);
    const [isSavingSetup, startSetupTransition] = useTransition();

    const clearPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const isConnected = status === "open" || status === "connected";
    const isConnecting = status === "connecting";

    const isSetupComplete = Boolean(
        assistantName.trim() &&
            storeAddress.trim() &&
            acceptedPaymentMethods.length &&
            availableDeliveryTypes.length,
    );

    const setupChecklist = useMemo(
        () => [
            {
                label: "Atendente definido",
                ready: Boolean(assistantName.trim()),
            },
            {
                label: "Endereco da loja",
                ready: Boolean(storeAddress.trim()),
            },
            {
                label: "Pagamentos configurados",
                ready: acceptedPaymentMethods.length > 0,
            },
            {
                label: "Entrega ou retirada",
                ready: availableDeliveryTypes.length > 0,
            },
        ],
        [
            acceptedPaymentMethods.length,
            assistantName,
            availableDeliveryTypes.length,
            storeAddress,
        ],
    );

    const paymentSummary = useMemo(
        () =>
            acceptedPaymentMethods.length
                ? acceptedPaymentMethods.map(getPaymentMethodLabel).join(" • ")
                : "Escolha ao menos um metodo",
        [acceptedPaymentMethods],
    );

    const deliverySummary = useMemo(
        () =>
            availableDeliveryTypes.length
                ? availableDeliveryTypes.map(getDeliveryTypeLabel).join(" • ")
                : "Escolha entrega, retirada ou ambos",
        [availableDeliveryTypes],
    );

    const pollQrCode = useCallback(async () => {
        try {
            const response = await fetch("/api/dashboard/whatsapp/qr-code", {
                cache: "no-store",
            });
            const payload = (await response.json().catch(() => null)) as
                | QrCodePayload
                | { error?: string }
                | null;

            if (!response.ok) {
                throw new Error(
                    payload && "error" in payload && payload.error
                        ? payload.error
                        : "Nao foi possivel consultar o QR Code.",
                );
            }

            if (!payload || !("status" in payload)) {
                throw new Error("Resposta invalida ao consultar o QR Code.");
            }

            setStatus(payload.status.toLowerCase());
            setQrCodeBase64(payload.qrCodeBase64);
            setPairingCode(payload.pairingCode);
            setInstanceName(payload.instanceName);

            if (payload.status.toLowerCase() === "open") {
                clearPolling();
                toast.success("WhatsApp conectado com sucesso.");
                router.push("/dashboard");
                router.refresh();
            }
        } catch (error) {
            clearPolling();
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Falha ao consultar o status do WhatsApp.",
            );
        }
    }, [clearPolling, router]);

    const startPolling = useCallback(() => {
        clearPolling();
        pollingRef.current = setInterval(() => {
            void pollQrCode();
        }, POLLING_INTERVAL_MS);
    }, [clearPolling, pollQrCode]);

    async function handleConnect() {
        try {
            setIsLoading(true);

            const connectResponse = await fetch(
                "/api/dashboard/whatsapp/connect",
                {
                    method: "POST",
                },
            );
            const connectPayload = await connectResponse
                .json()
                .catch(() => null);

            if (!connectResponse.ok) {
                throw new Error(
                    connectPayload?.error ||
                        "Nao foi possivel iniciar a conexao do WhatsApp.",
                );
            }

            await pollQrCode();
            startPolling();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Falha ao iniciar o pareamento do WhatsApp.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    function validateSetup() {
        if (!assistantName.trim()) {
            return "Defina um nome para o atendente da loja.";
        }

        if (!storeAddress.trim()) {
            return "Informe o endereco da loja antes de gerar o QR Code.";
        }

        if (acceptedPaymentMethods.length === 0) {
            return "Selecione ao menos um metodo de pagamento aceito.";
        }

        if (availableDeliveryTypes.length === 0) {
            return "Selecione ao menos uma modalidade de atendimento.";
        }

        return null;
    }

    async function persistSetup() {
        const assistantProfileFormData = new FormData();
        assistantProfileFormData.set("assistantName", assistantName);
        assistantProfileFormData.set("businessProfile", businessProfile);
        await assistantProfileAction(assistantProfileFormData);

        const storeCheckoutFormData = new FormData();
        storeCheckoutFormData.set("storeAddress", storeAddress);
        storeCheckoutFormData.set("deliveryFee", deliveryFee);

        for (const paymentMethod of acceptedPaymentMethods) {
            storeCheckoutFormData.append(
                "acceptedPaymentMethods",
                paymentMethod,
            );
        }

        for (const deliveryType of availableDeliveryTypes) {
            storeCheckoutFormData.append(
                "availableDeliveryTypes",
                deliveryType,
            );
        }

        await storeCheckoutAction(storeCheckoutFormData);
    }

    function handlePrimaryAction() {
        const validationError = validateSetup();

        if (validationError) {
            setSetupError(validationError);
            return;
        }

        setSetupError(null);

        startSetupTransition(async () => {
            try {
                await persistSetup();
                toast.success("Configuracao da loja salva.");

                if (!isConnected) {
                    await handleConnect();
                    return;
                }

                router.refresh();
            } catch (error) {
                setSetupError(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel salvar a configuracao da loja.",
                );
            }
        });
    }

    function handleOpenDialog() {
        setDialogOpen(true);

        if (isConnecting) {
            void pollQrCode();
            startPolling();
        }
    }

    useEffect(() => {
        if (status === "connecting") {
            void pollQrCode();
            startPolling();
        }

        return () => clearPolling();
    }, [clearPolling, pollQrCode, startPolling, status]);

    const selectedProfile =
        BUSINESS_PROFILE_OPTIONS.find(
            (option) => option.value === businessProfile,
        ) ?? BUSINESS_PROFILE_OPTIONS[0];

    return (
        <>
            <Card className="overflow-hidden border-none shadow-sm">
                <CardHeader className="border-b border-slate-200 bg-slate-50/70 pb-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <QrCode className="h-5 w-5 text-primary" />
                                Central de conexao da loja
                            </CardTitle>
                            <p className="max-w-2xl text-sm text-slate-500">
                                Antes do QR Code, a loja ja sai com endereco,
                                pagamento e atendimento configurados.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge
                                variant={
                                    isConnected
                                        ? "default"
                                        : isSetupComplete
                                          ? "outline"
                                          : "secondary"
                                }
                            >
                                {isConnected
                                    ? "WhatsApp conectado"
                                    : isSetupComplete
                                      ? "Pronto para gerar QR"
                                      : "Finalize o setup"}
                            </Badge>
                            {instanceName ? (
                                <Badge variant="outline">{instanceName}</Badge>
                            ) : null}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="flex flex-wrap  lg:items-center">
                    <div className="grid gap-3 sm:grid-cols-3 w-full mb-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Atendente
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">
                                {assistantName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {selectedProfile.label}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Checkout
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">
                                {acceptedPaymentMethods.length} pagamento(s)
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {deliverySummary}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                Endereco da loja
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">
                                {storeAddress.trim()
                                    ? "Configurado"
                                    : "Pendente"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {storeAddress.trim() || "Informe antes de conectar"}
                            </p>
                        </div>
                    </div>

                    <Button
                        type="button"
                        onClick={handleOpenDialog}
                        className="w-full lg:min-w-[220px]"
                    >
                        {isConnected
                            ? "Abrir central da instancia"
                            : isSetupComplete
                              ? "Configurar e gerar QR"
                              : "Completar setup e conectar"}
                    </Button>
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent
                    className="h-[min(88vh,860px)] w-[min(1180px,calc(100vw-2rem))] max-w-[min(1180px,calc(100vw-2rem))] overflow-hidden p-0 sm:max-w-[min(1180px,calc(100vw-2rem))]"
                    showCloseButton={!isLoading && !isSavingSetup}
                >
                    <div className="grid h-full lg:grid-cols-[320px_minmax(0,1fr)]">
                        <div className="overflow-y-auto border-b border-white/10 bg-[linear-gradient(160deg,rgba(15,23,42,1),rgba(30,41,59,0.95),rgba(15,23,42,1))] px-6 py-6 text-white lg:border-b-0 lg:border-r">
                            <DialogHeader className="space-y-3 text-left">
                                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                                    <Settings2 className="h-3.5 w-3.5" />
                                    Nova instancia
                                </div>
                                <DialogTitle className="text-2xl tracking-tight text-white">
                                    Prepare a loja antes do QR
                                </DialogTitle>
                                <DialogDescription className="text-sm leading-6 text-slate-300">
                                    O atendente, o endereco e o checkout ja ficam
                                    prontos para a IA responder com contexto
                                    certo desde a primeira mensagem.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="mt-6 space-y-3">
                                {setupChecklist.map((item) => (
                                    <div
                                        key={item.label}
                                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5"
                                    >
                                        <span className="text-sm text-slate-100">
                                            {item.label}
                                        </span>
                                        <span
                                            className={
                                                item.ready
                                                    ? "text-emerald-300"
                                                    : "text-slate-500"
                                            }
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                        </span>
                                    </div>
                                ))}
                            </div>
                            
                            
                                <div className="mt-6 space-y-3 rounded-[26px] border border-white/10 bg-white/8 p-4">
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                            Pagamentos
                                        </p>
                                        <p className="text-sm leading-6 text-white">
                                            {paymentSummary}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                            Operacao
                                        </p>
                                        <p className="text-sm leading-6 text-white">
                                            {deliverySummary}
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                                            Endereco
                                        </p>
                                        <p className="text-sm leading-6 text-white/90">
                                            {storeAddress.trim() ||
                                                "Ainda nao preenchido"}
                                        </p>
                                    </div>
                                </div>
                        </div>
                        <ScrollArea className="h-200">
                        <div className="flex min-w-0 flex-col bg-white">
                            <div className="min-w-0 flex-1 overflow-y-auto">
                                <div className="space-y-6 p-6">
                                <section className="grid gap-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-slate-900">
                                                Identidade do atendimento
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                Defina como a IA se apresenta e
                                                em qual nicho ela vai operar.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="dialogAssistantName">
                                                Nome do atendente
                                            </Label>
                                            <Input
                                                id="dialogAssistantName"
                                                value={assistantName}
                                                onChange={(event) =>
                                                    setAssistantName(
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="Ex: Clara, Julia, Time da Loja"
                                                maxLength={80}
                                                disabled={isSavingSetup}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="dialogBusinessProfile">
                                            Perfil do negocio
                                        </Label>
                                        <Select
                                            value={businessProfile}
                                            onValueChange={(value) =>
                                                setBusinessProfile(
                                                    value as BusinessProfile,
                                                )
                                            }
                                            disabled={isSavingSetup}
                                        >
                                            <SelectTrigger
                                                id="dialogBusinessProfile"
                                                className="bg-white"
                                            >
                                                <SelectValue placeholder="Selecione o perfil" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {BUSINESS_PROFILE_OPTIONS.map(
                                                    (option) => (
                                                        <SelectItem
                                                            key={option.value}
                                                            value={option.value}
                                                        >
                                                            {option.label}
                                                        </SelectItem>
                                                    ),
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs leading-5 text-slate-500">
                                            {selectedProfile.description}
                                        </p>
                                    </div>
                                </section>

                                <section className="grid gap-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
                                    <div className="space-y-5">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-slate-900">
                                                Operacao da loja
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                Informe onde a loja opera e como
                                                os pedidos podem ser recebidos.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="dialogStoreAddress">
                                                Endereco da loja
                                            </Label>
                                            <Textarea
                                                id="dialogStoreAddress"
                                                rows={4}
                                                value={storeAddress}
                                                onChange={(event) =>
                                                    setStoreAddress(
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="Ex: Rua Joaquim Fernandes Meira, 14, Centro"
                                                disabled={isSavingSetup}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className="h-4 w-4 text-primary" />
                                                <Label>
                                                    Como a loja atende
                                                </Label>
                                            </div>
                                            <DeliveryTypePicker
                                                value={availableDeliveryTypes}
                                                onChange={
                                                    setAvailableDeliveryTypes
                                                }
                                                disabled={isSavingSetup}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-5">
                                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="rounded-2xl bg-white p-2 text-primary shadow-sm">
                                                    <MapPinned className="h-4 w-4" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-semibold text-slate-900">
                                                        Taxa de entrega
                                                    </p>
                                                    <p className="text-xs leading-5 text-slate-500">
                                                        Valor fixo para pedidos
                                                        de delivery. Se nao
                                                        quiser cobrar, use 0.
                                                    </p>
                                                </div>
                                            </div>
                                            <Input
                                                className="mt-4 bg-white"
                                                inputMode="decimal"
                                                value={deliveryFee}
                                                onChange={(event) =>
                                                    setDeliveryFee(
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="Ex: 6,00"
                                                disabled={isSavingSetup}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <WalletCards className="h-4 w-4 text-primary" />
                                                <Label>
                                                    Pagamentos aceitos
                                                </Label>
                                            </div>
                                            <PaymentMethodPicker
                                                value={acceptedPaymentMethods}
                                                onChange={
                                                    setAcceptedPaymentMethods
                                                }
                                                disabled={isSavingSetup}
                                            />
                                        </div>
                                    </div>
                                </section>

                                <section className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-5">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-sm font-semibold text-slate-900">
                                                Pareamento do WhatsApp
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                Assim que as preferencias forem
                                                salvas, o QR Code aparece aqui
                                                para leitura no celular da loja.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge
                                                variant={
                                                    isConnected
                                                        ? "default"
                                                        : "outline"
                                                }
                                            >
                                                {isConnected
                                                    ? "Conectado"
                                                    : isConnecting
                                                      ? "Aguardando leitura"
                                                      : "Ainda nao pareado"}
                                            </Badge>
                                            {instanceName ? (
                                                <Badge variant="outline">
                                                    {instanceName}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-5">
                                        {qrCodeBase64 ? (
                                            <div className="flex flex-col items-center gap-4 text-center">
                                                <Image
                                                    src={qrCodeBase64}
                                                    alt="QR Code do WhatsApp"
                                                    width={260}
                                                    height={260}
                                                    className="rounded-xl border border-slate-200 bg-white p-3"
                                                    unoptimized
                                                />
                                                {pairingCode ? (
                                                    <p className="text-xs text-slate-500">
                                                        Codigo de pareamento:{" "}
                                                        <strong className="text-slate-700">
                                                            {pairingCode}
                                                        </strong>
                                                    </p>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                                                <div className="rounded-full bg-slate-100 p-4 text-slate-500">
                                                    {isLoading || isConnecting ? (
                                                        <Loader2 className="h-6 w-6 animate-spin" />
                                                    ) : (
                                                        <Smartphone className="h-6 w-6" />
                                                    )}
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-base font-semibold text-slate-900">
                                                        {isLoading ||
                                                        isConnecting
                                                            ? "Preparando QR Code"
                                                            : "Salve a configuracao para gerar o QR"}
                                                    </p>
                                                    <p className="max-w-md text-sm text-slate-500">
                                                        {isLoading ||
                                                        isConnecting
                                                            ? "Aguarde alguns segundos enquanto o sistema conversa com a Evolution."
                                                            : "Depois do setup, o QR aparece aqui e o status passa a ser acompanhado automaticamente."}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {setupError ? (
                                    <p className="text-sm font-medium text-rose-600">
                                        {setupError}
                                    </p>
                                ) : null}
                                </div>
                            </div>

                            <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-6 py-4 sm:justify-between">
                                <p className="text-xs text-slate-500">
                                    A configuracao e salva antes do QR para a IA
                                    ja nascer com o contexto correto.
                                </p>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    {!isConnected && qrCodeBase64 ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handleConnect}
                                            disabled={isLoading || isSavingSetup}
                                        >
                                            <RefreshCcw className="mr-2 h-4 w-4" />
                                            Atualizar QR
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        onClick={handlePrimaryAction}
                                        disabled={isLoading || isSavingSetup}
                                    >
                                        {isLoading || isSavingSetup ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {isSavingSetup
                                                    ? "Salvando e preparando..."
                                                    : "Gerando QR..."}
                                            </>
                                        ) : isConnected ? (
                                            "Revisar configuracao"
                                        ) : (
                                            "Salvar e gerar QR Code"
                                        )}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </div>
                        </ScrollArea>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
