"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, QrCode, RefreshCcw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

            setStatus(payload.status);
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
        <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                        <QrCode className="h-5 w-5 text-primary" />
                        Pareamento por QR Code
                    </CardTitle>
                    <p className="text-sm text-slate-500">
                        Gere o QR da Evolution, escaneie no celular da loja e
                        aguarde a abertura da sessao.
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
            <CardContent className="space-y-4">
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
                    {qrCodeBase64 ? (
                        <div className="flex flex-col items-center gap-4 text-center">
                            <Image
                                src={qrCodeBase64}
                                alt="QR Code do WhatsApp"
                                width={320}
                                height={320}
                                className="rounded-xl border border-slate-200 bg-white p-3"
                                unoptimized
                            />
                            {pairingCode && (
                                <p className="text-xs text-slate-500">
                                    Codigo de pareamento:{" "}
                                    <strong className="text-slate-700">
                                        {pairingCode}
                                    </strong>
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
                            <div className="rounded-full bg-white p-4 text-slate-500 shadow-sm">
                                <Smartphone className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-lg font-semibold text-slate-900">
                                    Nenhum QR carregado ainda
                                </p>
                                <p className="max-w-md text-sm text-slate-500">
                                    Clique em conectar para solicitar o QR Code
                                    da Evolution e iniciar o pareamento.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        onClick={handleConnect}
                        disabled={isLoading || isConnected}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Gerando QR...
                            </>
                        ) : isConnecting ? (
                            <>
                                <RefreshCcw className="mr-2 h-4 w-4" />
                                Atualizar QR
                            </>
                        ) : (
                            "Conectar WhatsApp"
                        )}
                    </Button>

                    {instanceName && (
                        <p className="text-sm text-slate-500">
                            Instancia:{" "}
                            <strong className="text-slate-700">
                                {instanceName}
                            </strong>
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
