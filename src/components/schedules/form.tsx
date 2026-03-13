"use client";
import { BotAccount, MessageTemplate } from "@prisma/client";
import { Button } from "../ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { createSchedule } from "@/app/admin/schedules/actions";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface ScheduleFormProps {
    bots: BotAccount[];
    templates: MessageTemplate[];
}

export function ScheduleForm({ bots, templates }: ScheduleFormProps) {
    return (
        <form
            action={createSchedule}
            className="grid grid-cols-1 md:grid-cols-4 gap-6"
        >
            <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                    Conta (Bot)
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-slate-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                            Conta que enviará as mensagens.
                        </TooltipContent>
                    </Tooltip>
                </label>

                <Select name="botId" required>
                    <SelectTrigger className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                        <SelectValue placeholder="Selecionar conta..." />
                    </SelectTrigger>
                    <SelectContent>
                        {bots.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                                {t.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                    Template
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="w-3.5 h-3.5 text-slate-400" />
                        </TooltipTrigger>
                        <TooltipContent>
                            Conteúdo que será enviado.
                        </TooltipContent>
                    </Tooltip>
                </label>
                <Select name="templateId" required>
                    <SelectTrigger className="w-full bg-slate-50/50 border-slate-200">
                        <SelectValue placeholder="Selecionar template..." />
                    </SelectTrigger>
                    <SelectContent>
                        {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                                {t.title}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                    Horário
                </label>
                <Input
                    name="time"
                    type="time"
                    required
                    className="bg-slate-50/50 border-slate-200"
                />
            </div>

            <div className="space-y-2">
                <label className="text-sm font-semibold mb-2 block">
                    Dias da semana
                </label>
                <div className="flex gap-1">
                    {DAY_LABELS.map((label, d) => (
                        <label
                            key={d}
                            className="flex flex-col items-center flex-1 cursor-pointer group"
                        >
                            <input
                                type="checkbox"
                                name="weekDays"
                                value={d}
                                defaultChecked
                                className="peer sr-only"
                            />
                            <span className="w-full py-1.5 text-[10px] font-bold text-center rounded bg-slate-100 text-slate-400 peer-checked:bg-primary peer-checked:text-white transition-all">
                                {label}
                            </span>
                        </label>
                    ))}
                </div>
            </div>

            <Button
                type="submit"
                className="md:col-span-4 w-full bg-primary hover:bg-primary/90"
            >
                Salvar Agendamento
            </Button>
        </form>
    );
}
