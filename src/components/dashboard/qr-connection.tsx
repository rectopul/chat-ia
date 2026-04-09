"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, QrCode, RefreshCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

type QRConnectionProps = {
    initialStatus: string | null;
};

type QrCodePayload = {
    instanceId: string;
    instanceName: string;
    status: string;
    qrCodeBase64: string | null;
    pairingCode: string | null;
};

const POLLING_INTERVAL_MS = 5000;

export default function QRConnection({ initialStatus }: QRConnectionProps) {
    const router = useRouter();
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState(initialStatus?.toLowerCase() ?? null);
    const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [instanceName, setInstanceName] = useState<string | null>(null);

    const clearPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

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
                setDialogOpen(false);
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

    async function handleOpenDialog() {
        setDialogOpen(true);

        if (isConnected) {
            return;
        }

        if (isConnecting) {
            await pollQrCode();
            startPolling();
            return;
        }

        await handleConnect();
    }

    useEffect(() => {
        if (status === "connecting") {
            void pollQrCode();
            startPolling();
        }

        return () => clearPolling();
    }, [clearPolling, pollQrCode, startPolling, status]);

    const isConnected = status === "open" || status === "connected";
    const isConnecting = status === "connecting";

    return (
        <>
            <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <QrCode className="h-5 w-5 text-primary" />
                            Pareamento por QR Code
                        </CardTitle>
                        <p className="text-sm text-slate-500">
                            Abra o modal para gerar e escanear o QR com o celular da loja.
                        </p>
                    </div>
                    <Badge variant={isConnected ? "default" : "outline"}>
                        {isConnected
                            ? "Conectado"
                            : isConnecting
                              ? "Aguardando leitura"
                              : "Pronto para conectar"}
                    </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {instanceName ? (
                            <>
                                Instancia ativa:{" "}
                                <strong className="text-slate-900">
                                    {instanceName}
                                </strong>
                            </>
                        ) : (
                            "Clique em conectar para abrir o QR Code em um modal."
                        )}
                    </div>

                    <Button
                        type="button"
                        onClick={handleOpenDialog}
                        disabled={isConnected || (isLoading && !isConnecting)}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Gerando QR...
                            </>
                        ) : isConnected ? (
                            "WhatsApp conectado"
                        ) : isConnecting || qrCodeBase64 ? (
                            <>
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Abrir QR Code
                            </>
                        ) : (
                            "Conectar WhatsApp"
                        )}
                    </Button>
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <QrCode className="h-5 w-5 text-primary" />
                            Escaneie o QR Code
                        </DialogTitle>
                        <DialogDescription>
                            Use o WhatsApp do celular da loja para concluir o pareamento.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={isConnected ? "default" : "outline"}>
                                {isConnected
                                    ? "Conectado"
                                    : isConnecting
                                      ? "Aguardando leitura"
                                      : "Preparando QR"}
                            </Badge>
                            {instanceName ? (
                                <Badge variant="outline">{instanceName}</Badge>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
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
                                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                                    <div className="rounded-full bg-white p-4 text-slate-500 shadow-sm">
                                        {isLoading || isConnecting ? (
                                            <Loader2 className="h-6 w-6 animate-spin" />
                                        ) : (
                                            <Smartphone className="h-6 w-6" />
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-base font-semibold text-slate-900">
                                            {isLoading || isConnecting
                                                ? "Gerando QR Code"
                                                : "Nenhum QR carregado ainda"}
                                        </p>
                                        <p className="max-w-md text-sm text-slate-500">
                                            {isLoading || isConnecting
                                                ? "Aguarde alguns segundos enquanto o sistema prepara o pareamento."
                                                : "Clique em conectar para iniciar o pareamento com a Evolution."}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!isConnected ? (
                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    type="button"
                                    onClick={handleConnect}
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Atualizando QR...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCcw className="mr-2 h-4 w-4" />
                                            Atualizar QR
                                        </>
                                    )}
                                </Button>
                                <p className="text-xs text-slate-500">
                                    O status e consultado automaticamente a cada 5 segundos.
                                </p>
                            </div>
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
