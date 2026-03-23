// app/scraping/_components/job-card.tsx
"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
    MoreVertical,
    Eye,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";

import { ScrapingJob } from "../_lib/types";
import { ScrapingAPI } from "../_lib/api";
import { toast } from "sonner";

interface JobCardProps {
    job: ScrapingJob;
    onViewDetails: (jobId: string) => void;
    onJobUpdated?: () => void;
}

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

export function JobCard({ job, onViewDetails, onJobUpdated }: JobCardProps) {
    const [isRetrying, setIsRetrying] = useState(false);

    // Progresso baseado no que já foi processado (sucesso + falha) em relação ao total
    const processedUsers = job.transferredUsers + job.failedUsers;
    const progressPercentage =
        job.totalUsers > 0 ? (processedUsers / job.totalUsers) * 100 : 0;

    const handleRetry = async () => {
        setIsRetrying(true);
        try {
            // Usando job.jobId aqui
            const result = await ScrapingAPI.retryFailed(job.jobId);

            toast.success("Transferências reenfileiradas", {
                description: `${result.retried} transferências voltaram para a fila.`,
            });

            onJobUpdated?.();
        } catch (error) {
            toast.error("Erro ao retentar", {
                description:
                    error instanceof Error
                        ? error.message
                        : "Erro desconhecido",
            });
        } finally {
            setIsRetrying(false);
        }
    };

    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        {getStatusBadge(job.status)}
                        <span className="text-xs text-muted-foreground">
                            {/* Verificação de segurança para a data */}
                            {job.createdAt &&
                                format(
                                    new Date(job.createdAt),
                                    "dd 'de' MMM 'às' HH:mm",
                                    { locale: ptBR },
                                )}
                        </span>
                    </div>
                    <p className="text-sm font-medium">
                        {/* Exibe o título se houver, senão o ID */}
                        {job.sourceGroupTitle || job.sourceGroupId} →{" "}
                        {job.targetGroupTitle || job.targetGroupId}
                    </p>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            onClick={() => onViewDetails(job.jobId)}
                        >
                            <Eye className="mr-2 h-4 w-4" />
                            Ver Detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleRetry}
                            disabled={isRetrying || job.failedUsers === 0}
                        >
                            <RefreshCw
                                className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
                            />
                            Retentar Falhas
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                            Status da Transferência
                        </span>
                        <span className="font-medium">
                            {Math.round(progressPercentage)}%
                        </span>
                    </div>
                    <Progress value={progressPercentage} className="h-1.5" />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Total
                        </p>
                        <p className="text-sm font-semibold">
                            {job.totalUsers}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Extraídos
                        </p>
                        <p className="text-sm font-semibold text-blue-600">
                            {job.scrapedUsers}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Sucesso
                        </p>
                        <p className="text-sm font-semibold text-green-600">
                            {job.transferredUsers}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Falhas
                        </p>
                        <p className="text-sm font-semibold text-red-600">
                            {job.failedUsers}
                        </p>
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onViewDetails(job.jobId)}
                >
                    <Eye className="mr-2 h-4 w-4" />
                    Gerenciar Membros
                </Button>
            </CardContent>
        </Card>
    );
}
