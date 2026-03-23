// app/scraping/_components/scraping-page-client.tsx
"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

import { Bot } from "../_lib/types";
import { ScrapingForm } from "./scraping-form";
import { ScrapingProgress } from "./scraping-progress";
import { JobsList } from "./jobs-list";

interface ScrapingPageClientProps {
    bots: Bot[];
}

export function ScrapingPageClient({ bots }: ScrapingPageClientProps) {
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleJobCreated = (jobId: string) => {
        // Atualiza a lista de jobs
        setRefreshTrigger((prev) => prev + 1);

        // Abre automaticamente os detalhes do novo job
        setSelectedJobId(jobId);
    };

    const handleViewDetails = (jobId: string) => {
        setSelectedJobId(jobId);
    };

    const handleCloseDetails = () => {
        setSelectedJobId(null);
        // Refresh ao fechar para pegar atualizações
        setRefreshTrigger((prev) => prev + 1);
    };

    return (
        <>
            <Tabs defaultValue="new" className="space-y-6">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="new">Novo Scraping</TabsTrigger>
                    <TabsTrigger value="jobs">Meus Jobs</TabsTrigger>
                </TabsList>

                {/* Tab: Novo Scraping */}
                <TabsContent value="new" className="space-y-6">
                    <ScrapingForm bots={bots} onJobCreated={handleJobCreated} />
                </TabsContent>

                {/* Tab: Lista de Jobs */}
                <TabsContent value="jobs" className="space-y-6">
                    <JobsList
                        bots={bots}
                        onViewDetails={handleViewDetails}
                        refreshTrigger={refreshTrigger}
                    />
                </TabsContent>
            </Tabs>

            {/* Dialog de Detalhes do Job */}
            <Dialog open={!!selectedJobId} onOpenChange={handleCloseDetails}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Detalhes do Scraping</DialogTitle>
                    </DialogHeader>
                    {selectedJobId && (
                        <ScrapingProgress
                            jobId={selectedJobId}
                            autoRefresh={true}
                            refreshInterval={10}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
