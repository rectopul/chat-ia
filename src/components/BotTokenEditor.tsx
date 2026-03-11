"use client";
import { useState } from "react";
import axios from "axios";

interface Props {
    botId: string;
    currentToken: string;
    onSave: (botId: string, token: string) => Promise<void>;
}

type Status = "idle" | "saving" | "registering" | "done" | "error";

export function BotTokenEditor({ botId, currentToken, onSave }: Props) {
    const [editing, setEditing] = useState(false);
    const [token, setToken] = useState(currentToken);
    const [saved, setSaved] = useState(currentToken);
    const [status, setStatus] = useState<Status>("idle");
    const [errorMsg, setErrorMsg] = useState("");

    const handleSave = async () => {
        setStatus("saving");
        setErrorMsg("");
        try {
            // 1. Persiste no banco via server action
            await onSave(botId, token);
            setSaved(token);

            // 2. Inicializa o bot no NestJS em tempo real (sem restart)
            setStatus("registering");
            await axios.post(
                `${process.env.NEXT_PUBLIC_NEST_API_URL}/telegram/register-business-bot`,
                {
                    botId,
                    token,
                },
            );

            setStatus("done");
            setEditing(false);

            // Reseta o indicador de sucesso após 3s
            setTimeout(() => setStatus("idle"), 3000);
        } catch (err: any) {
            setErrorMsg(
                err.response?.data?.message ||
                    "Erro ao registrar o bot. Verifique o token.",
            );
            setStatus("error");
        }
    };

    const handleCancel = () => {
        setToken(saved);
        setEditing(false);
        setStatus("idle");
        setErrorMsg("");
    };

    const statusLabel: Record<Status, string> = {
        idle: "Salvar",
        saving: "Salvando...",
        registering: "Iniciando bot...",
        done: "✓ Ativo",
        error: "Salvar",
    };

    // ── Modo visualização ──────────────────────────────────────────────
    if (!editing) {
        return (
            <div className="flex items-center gap-2 group">
                {saved ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0" />
                        <span
                            className="font-mono truncate max-w-[180px]"
                            title={saved}
                        >
                            {saved.slice(0, 10)}…{saved.slice(-6)}
                        </span>
                    </span>
                ) : (
                    <span className="text-xs text-gray-400 italic">
                        Não configurado
                    </span>
                )}
                <button
                    onClick={() => setEditing(true)}
                    className="opacity-0 group-hover:opacity-100 transition text-xs text-indigo-500 hover:underline shrink-0"
                >
                    {saved ? "Editar" : "Adicionar"}
                </button>
            </div>
        );
    }

    // ── Modo edição ────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-1.5">
            <input
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:ABC-xxx..."
                className="w-full p-1.5 border rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />

            {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

            {/* Feedback de progresso */}
            {(status === "saving" || status === "registering") && (
                <p className="text-xs text-indigo-500 animate-pulse">
                    {status === "saving"
                        ? "Salvando no banco..."
                        : "Conectando bot ao Telegram..."}
                </p>
            )}

            <div className="flex gap-2">
                <button
                    onClick={handleSave}
                    disabled={
                        status === "saving" ||
                        status === "registering" ||
                        token === saved ||
                        !token
                    }
                    className="flex-1 py-1 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 disabled:opacity-40 transition"
                >
                    {statusLabel[status]}
                </button>
                <button
                    onClick={handleCancel}
                    disabled={status === "saving" || status === "registering"}
                    className="flex-1 py-1 border text-xs rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}
