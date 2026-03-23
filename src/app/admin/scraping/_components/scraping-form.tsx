// app/scraping/_components/scraping-form.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, PlayCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

import { ScrapingAPI } from "../_lib/api";
import { Bot } from "../_lib/types";
import { toast } from "sonner";

const formSchema = z.object({
    botId: z.string().min(1, "Selecione um bot"),
    sourceGroupId: z.string().min(1, "Informe o grupo de origem"),
    targetGroupId: z.string().min(1, "Informe o grupo de destino"),
});

type FormValues = z.infer<typeof formSchema>;

interface ScrapingFormProps {
    bots: Bot[];
    onJobCreated: (jobId: string) => void;
}

export function ScrapingForm({ bots, onJobCreated }: ScrapingFormProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            botId: "",
            sourceGroupId: "",
            targetGroupId: "",
        },
    });

    async function onSubmit(values: FormValues) {
        setIsSubmitting(true);

        try {
            const response = await ScrapingAPI.startScraping(values);

            toast.success("Scraping iniciado!", {
                description: response.message,
            });

            // Notifica o componente pai sobre o novo job
            onJobCreated(response.jobId);

            // Reseta o formulário
            form.reset();
        } catch (error) {
            toast.error("Erro ao iniciar scraping", {
                description:
                    error instanceof Error
                        ? error.message
                        : "Erro desconhecido",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Novo Scraping</CardTitle>
                <CardDescription>
                    Extraia membros de um grupo público e transfira para seu
                    grupo
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-6"
                    >
                        {/* Select Bot */}
                        <FormField
                            control={form.control}
                            name="botId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Bot</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        defaultValue={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione um bot" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {bots.map((bot) => (
                                                <SelectItem
                                                    key={bot.id}
                                                    value={bot.id}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">
                                                            {bot.name}
                                                        </span>
                                                        <span className="text-muted-foreground text-sm">
                                                            @{bot.phoneNumber}
                                                        </span>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormDescription>
                                        Escolha qual bot será usado para fazer o
                                        scraping
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Grupo de Origem */}
                        <FormField
                            control={form.control}
                            name="sourceGroupId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Grupo de Origem</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="@marketingdigital ou -1001234567890"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        Username (@exemplo) ou ID do grupo
                                        público de onde extrair membros
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Grupo de Destino */}
                        <FormField
                            control={form.control}
                            name="targetGroupId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Grupo de Destino</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="-1001234567890"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        ID do grupo para onde transferir os
                                        membros
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Botão Submit */}
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Iniciando...
                                </>
                            ) : (
                                <>
                                    <PlayCircle className="mr-2 h-4 w-4" />
                                    Iniciar Scraping
                                </>
                            )}
                        </Button>
                    </form>
                </Form>

                {/* Avisos Importantes */}
                <div className="mt-6 space-y-2 rounded-lg bg-muted p-4 text-sm">
                    <p className="font-semibold">⚠️ Avisos Importantes:</p>
                    <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                        <li>
                            O grupo de origem deve ser <strong>público</strong>
                        </li>
                        <li>
                            O bot deve ter permissão para adicionar membros no
                            grupo destino
                        </li>
                        <li>
                            Contas novas: ~20-30 convites/dia (risco de ban)
                        </li>
                        <li>Contas antigas: ~100-150 convites/dia</li>
                        <li>
                            Taxa de falha esperada: 30-50% (privacidade normal)
                        </li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
}
