// app/scraping/page.tsx

import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { getBots } from "./_actions/get-bots";
import { ScrapingPageClient } from "./_components/scraping-page-client";

export const metadata = {
    title: "Scraping de Grupos | Telegram",
    description: "Extraia e transfira membros entre grupos do Telegram",
};

export default async function ScrapingPage() {
    // Busca bots do banco de dados (Server Component)
    const bots = await getBots();

    return (
        <div className="container mx-auto py-8 space-y-8">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">
                    Scraping de Grupos
                </h1>
                <p className="text-muted-foreground">
                    Extraia membros de grupos públicos e transfira para seu
                    grupo com segurança
                </p>
            </div>

            {/* Verifica se há bots disponíveis */}
            {bots.length === 0 ? (
                <div className="rounded-lg border border-dashed border-muted-foreground/25 p-12 text-center">
                    <p className="text-lg font-semibold">
                        Nenhum bot configurado
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Configure pelo menos um bot antes de iniciar o scraping
                    </p>
                </div>
            ) : (
                <Suspense
                    fallback={
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    }
                >
                    <ScrapingPageClient bots={bots} />
                </Suspense>
            )}
        </div>
    );
}
