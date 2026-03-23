// app/scraping/_components/scraping-progress.tsx
"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ScrapingAPI } from "../_lib/api";
import { ScrapingProgress as ScrapingProgressType } from "../_lib/types";

interface ScrapingProgressProps {
    jobId: string;
    autoRefresh?: boolean;
    refreshInterval?: number; // em segundos
}

export function ScrapingProgress({
    jobId,
    autoRefresh = true,
    refreshInterval = 10,
}: ScrapingProgressProps) {
    const [progress, setProgress] = useState<ScrapingProgressType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProgress = async () => {
        try {
            setError(null);
            const data = await ScrapingAPI.getProgress(jobId);
            setProgress(data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Erro ao buscar progresso",
            );
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProgress();

        if (autoRefresh) {
            const interval = setInterval(fetchProgress, refreshInterval * 1000);
            return () => clearInterval(interval);
        }
    }, [jobId, autoRefresh, refreshInterval]);

    if (isLoading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="py-10">
                    <div className="text-center">
                        <XCircle className="mx-auto h-8 w-8 text-destructive" />
                        <p className="mt-2 text-sm text-muted-foreground">
                            {error}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={fetchProgress}
                        >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Tentar novamente
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!progress) return null;

    const progressPercentage =
        progress.totalUsers > 0
            ? ((progress.transferredUsers + progress.failedUsers) /
                  progress.totalUsers) *
              100
            : 0;

    const getStatusBadge = (status: string) => {
        const badges = {
            PENDING: (
                <Badge variant="secondary">
                    <Clock className="mr-1 h-3 w-3" />
                    Pendente
                </Badge>
            ),
            IN_PROGRESS: (
                <Badge variant="default">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Em Progresso
                </Badge>
            ),
            COMPLETED: (
                <Badge variant="default" className="bg-green-500">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Concluído
                </Badge>
            ),
            FAILED: (
                <Badge variant="destructive">
                    <XCircle className="mr-1 h-3 w-3" />
                    Falhou
                </Badge>
            ),
        };

        return badges[status as keyof typeof badges] || <Badge>{status}</Badge>;
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                    <CardTitle>Progresso do Scraping</CardTitle>
                    <CardDescription>
                        Job ID: {jobId.slice(0, 8)}...
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    {getStatusBadge(progress.status)}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchProgress}
                        disabled={isLoading}
                    >
                        <RefreshCw
                            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                        />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Barra de Progresso */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Progresso Geral</span>
                        <span className="text-muted-foreground">
                            {Math.round(progressPercentage)}%
                        </span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                </div>

                {/* Estatísticas em Grid */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <StatCard
                        label="Total"
                        value={progress.totalUsers}
                        variant="default"
                    />
                    <StatCard
                        label="Transferidos"
                        value={progress.transferredUsers}
                        variant="success"
                    />
                    <StatCard
                        label="Falhados"
                        value={progress.failedUsers}
                        variant="error"
                    />
                    <StatCard
                        label="Pendentes"
                        value={progress.pendingUsers}
                        variant="warning"
                    />
                </div>

                {/* Erros (se houver) */}
                {progress.errors && progress.errors.length > 0 && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                        <p className="mb-2 text-sm font-semibold text-destructive">
                            Erros encontrados:
                        </p>
                        <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                            {progress.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Estimativa de Tempo */}
                {progress.status === "IN_PROGRESS" &&
                    progress.pendingUsers > 0 && (
                        <div className="rounded-lg bg-muted p-4 text-sm">
                            <p className="font-semibold">⏱️ Estimativa:</p>
                            <p className="mt-1 text-muted-foreground">
                                Com 50 convites/dia, restam aproximadamente{" "}
                                <strong>
                                    {Math.ceil(progress.pendingUsers / 50)} dias
                                </strong>{" "}
                                para completar.
                            </p>
                        </div>
                    )}
            </CardContent>
        </Card>
    );
}

interface StatCardProps {
    label: string;
    value: number;
    variant: "default" | "success" | "error" | "warning";
}

function StatCard({ label, value, variant }: StatCardProps) {
    const variants = {
        default: "bg-muted",
        success: "bg-green-50 dark:bg-green-950",
        error: "bg-red-50 dark:bg-red-950",
        warning: "bg-yellow-50 dark:bg-yellow-950",
    };

    const textVariants = {
        default: "text-foreground",
        success: "text-green-700 dark:text-green-400",
        error: "text-red-700 dark:text-red-400",
        warning: "text-yellow-700 dark:text-yellow-400",
    };

    return (
        <div className={`rounded-lg p-4 ${variants[variant]}`}>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-bold ${textVariants[variant]}`}>
                {value.toLocaleString()}
            </p>
        </div>
    );
}
