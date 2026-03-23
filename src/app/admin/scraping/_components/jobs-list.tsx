// app/scraping/_components/jobs-list.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, Inbox } from "lucide-react";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import { ScrapingAPI } from "../_lib/api";
import { ScrapingJob, Bot } from "../_lib/types";
import { JobCard } from "./job-card";

interface JobsListProps {
    bots: Bot[];
    onViewDetails: (jobId: string) => void;
    refreshTrigger?: number; // Usado para forçar refresh externo
}

export function JobsList({
    bots,
    onViewDetails,
    refreshTrigger,
}: JobsListProps) {
    const [jobs, setJobs] = useState<ScrapingJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedBotId, setSelectedBotId] = useState<string>("all");

    const fetchJobs = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const data = await ScrapingAPI.getJobs(
                selectedBotId !== "all" ? selectedBotId : undefined,
            );
            setJobs(data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Erro ao buscar jobs",
            );
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
    }, [selectedBotId, refreshTrigger]);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Jobs de Scraping</CardTitle>
                        <CardDescription>
                            Histórico de scraping e transferências
                        </CardDescription>
                    </div>

                    {/* Filtro por Bot */}
                    <div className="flex items-center gap-2">
                        <Select
                            value={selectedBotId}
                            onValueChange={setSelectedBotId}
                        >
                            <SelectTrigger className="w-50">
                                <SelectValue placeholder="Filtrar por bot" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    Todos os bots
                                </SelectItem>
                                {bots.map((bot) => (
                                    <SelectItem key={bot.id} value={bot.id}>
                                        {bot.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>

            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="text-center py-12">
                        <p className="text-sm text-destructive mb-4">{error}</p>
                        <Button variant="outline" onClick={fetchJobs}>
                            Tentar novamente
                        </Button>
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-12">
                        <Inbox className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-sm text-muted-foreground">
                            Nenhum job encontrado
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Inicie um novo scraping para começar
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {jobs.map((job) => (
                            <JobCard
                                key={job.jobId}
                                job={job}
                                onViewDetails={onViewDetails}
                                onJobUpdated={fetchJobs}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
