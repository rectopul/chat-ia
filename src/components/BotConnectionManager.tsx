"use client";
import { useState } from "react";
import axios from "axios";

type Step = "idle" | "code" | "2fa" | "done";

export function BotConnectionManager({ bot }: { bot: any }) {
    const [step, setStep] = useState<Step>(bot.session ? "done" : "idle");
    const [phoneCode, setPhoneCode] = useState("");
    const [password2FA, setPassword2FA] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const API = process.env.NEXT_PUBLIC_NEST_API_URL + "/telegram";

    // ── PASSO 1: Solicitar código SMS ──────────────────────────────────
    const handleSendCode = async () => {
        setLoading(true);
        setError("");
        try {
            await axios.post(`${API}/send-code`, {
                botId: bot.id,
                phoneNumber: bot.phoneNumber,
            });
            setStep("code");
        } catch (err: any) {
            setError(
                err.response?.data?.message ||
                    "Erro ao enviar código. Verifique as credenciais API.",
            );
        } finally {
            setLoading(false);
        }
    };

    // ── PASSO 2: Verificar código SMS ──────────────────────────────────
    // O backend agora tem um endpoint /verify-code separado do /verify-password
    const handleVerifyCode = async () => {
        setLoading(true);
        setError("");
        try {
            const { data } = await axios.post(`${API}/verify-code`, {
                botId: bot.id,
                phoneNumber: bot.phoneNumber,
                code: phoneCode,
            });

            if (data.success) {
                setStep("done");
                window.location.reload();
            } else if (data.requires2FA) {
                // Conta tem senha 2FA — avança para o próximo passo
                setStep("2fa");
            }
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Código inválido ou expirado.",
            );
        } finally {
            setLoading(false);
        }
    };

    // ── PASSO 3: Verificar senha 2FA ───────────────────────────────────
    // Usa endpoint separado /verify-password
    const handleVerifyPassword = async () => {
        setLoading(true);
        setError("");
        try {
            const { data } = await axios.post(`${API}/verify-password`, {
                botId: bot.id,
                password: password2FA,
            });

            if (data.success) {
                setStep("done");
                window.location.reload();
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Senha incorreta.");
        } finally {
            setLoading(false);
        }
    };

    // ──────────────────────────────────────────────────────────────────

    if (step === "done") {
        return (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Conectado
            </span>
        );
    }

    return (
        <div className="flex flex-col gap-2 max-w-xs">
            {error && (
                <p className="text-xs text-red-600 font-medium">{error}</p>
            )}

            {step === "idle" && (
                <button
                    onClick={handleSendCode}
                    disabled={loading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                    {loading ? "Enviando..." : "Iniciar Conexão"}
                </button>
            )}

            {step === "code" && (
                <>
                    <p className="text-xs text-gray-500">
                        Código enviado para <strong>{bot.phoneNumber}</strong>
                    </p>
                    <input
                        placeholder="Código do Telegram"
                        value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value)}
                        className="border p-2 rounded-md text-sm"
                        maxLength={6}
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={handleVerifyCode}
                            disabled={loading || phoneCode.length < 4}
                            className="flex-1 bg-green-600 text-white p-2 rounded-md text-sm disabled:opacity-50"
                        >
                            {loading ? "Verificando..." : "Confirmar Código"}
                        </button>
                        <button
                            onClick={handleSendCode}
                            disabled={loading}
                            className="text-xs text-gray-500 hover:underline"
                        >
                            Reenviar
                        </button>
                    </div>
                </>
            )}

            {step === "2fa" && (
                <>
                    <p className="text-xs text-amber-600 font-semibold">
                        🔐 Esta conta tem Verificação em Duas Etapas
                    </p>
                    <input
                        type="password"
                        placeholder="Senha do Telegram"
                        value={password2FA}
                        onChange={(e) => setPassword2FA(e.target.value)}
                        className="border p-2 rounded-md text-sm"
                    />
                    <button
                        onClick={handleVerifyPassword}
                        disabled={loading || !password2FA}
                        className="bg-indigo-600 text-white p-2 rounded-md text-sm disabled:opacity-50"
                    >
                        {loading ? "Autenticando..." : "Entrar com Senha 2FA"}
                    </button>
                </>
            )}
        </div>
    );
}
