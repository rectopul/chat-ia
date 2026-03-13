import { prisma } from "@/lib/prisma";
import {
    Calendar,
    Plus,
    Info,
    Clock,
    CheckCircle2,
    PauseCircle,
    Trash2,
    Bot,
    FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createSchedule, deleteSchedule, toggleSchedule } from "./actions";
import { ScheduleForm } from "@/components/schedules/form";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function AdminSchedulesPage() {
    const [schedules, bots, templates] = await prisma.$transaction([
        prisma.recurringSchedule.findMany({
            include: { bot: true, template: true },
            orderBy: { hour: "asc" },
        }),
        prisma.botAccount.findMany({ where: { isActive: true } }),
        prisma.messageTemplate.findMany({ where: { isActive: true } }),
    ]);

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                    <Calendar className="w-8 h-8 text-primary" />
                    Agendamentos Recorrentes
                </h1>
                <p className="text-slate-500">
                    Programe disparos automáticos baseados em horários e dias da
                    semana.
                </p>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-primary" />
                        <CardTitle>Novo Agendamento</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScheduleForm bots={bots} templates={templates} />
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-slate-100">
                            <TableHead className="font-bold text-slate-700">
                                Conta / Template
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Horário
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Recorrência
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Status
                            </TableHead>
                            <TableHead className="text-right font-bold text-slate-700">
                                Ações
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {schedules.map((s) => (
                            <TableRow
                                key={s.id}
                                className={`border-slate-50 hover:bg-slate-50/30 transition-colors ${!s.isActive ? "opacity-60" : ""}`}
                            >
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                            <Bot className="w-3.5 h-3.5 text-slate-400" />
                                            {s.bot.name}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                            <FileText className="w-3.5 h-3.5" />
                                            {s.template.title}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 font-mono text-sm font-bold text-primary bg-primary/5 px-2 py-1 rounded w-fit">
                                        <Clock className="w-3.5 h-3.5" />
                                        {String(s.hour).padStart(2, "0")}:
                                        {String(s.minute).padStart(2, "0")}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-1">
                                        {DAY_LABELS.map((label, d) => (
                                            <span
                                                key={d}
                                                className={`text-[9px] font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                                                    s.weekDays.includes(d)
                                                        ? "bg-primary/10 text-primary border border-primary/20"
                                                        : "bg-slate-50 text-slate-300"
                                                }`}
                                            >
                                                {label[0]}
                                            </span>
                                        ))}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <form
                                        action={toggleSchedule.bind(
                                            null,
                                            s.id,
                                            s.isActive,
                                        )}
                                    >
                                        <button
                                            type="submit"
                                            className="transition-transform active:scale-95"
                                        >
                                            {s.isActive ? (
                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 shadow-none cursor-pointer">
                                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                                    Ativo
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="text-slate-400 border-slate-200 hover:bg-slate-50 cursor-pointer"
                                                >
                                                    <PauseCircle className="w-3 h-3 mr-1" />
                                                    Pausado
                                                </Badge>
                                            )}
                                        </button>
                                    </form>
                                </TableCell>
                                <TableCell className="text-right">
                                    <form
                                        action={deleteSchedule.bind(null, s.id)}
                                    >
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </form>
                                </TableCell>
                            </TableRow>
                        ))}
                        {schedules.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-32 text-center text-slate-400 italic"
                                >
                                    Nenhum agendamento ativo.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
