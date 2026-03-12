import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  Calendar,
  Plus,
  Info,
  Clock,
  CheckCircle2,
  PauseCircle,
  Trash2,
  Bot,
  FileText
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

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

    async function createSchedule(formData: FormData) {
        "use server";
        const botId = formData.get("botId") as string;
        const templateId = formData.get("templateId") as string;
        const time = formData.get("time") as string;
        const [hour, minute] = time.split(":").map(Number);
        const weekDays = formData.getAll("weekDays").map(Number);

        await prisma.recurringSchedule.create({
            data: { botId, templateId, hour, minute, weekDays },
        });
        revalidatePath("/admin/schedules");
    }

    async function toggleSchedule(id: string, current: boolean) {
        "use server";
        await prisma.recurringSchedule.update({
            where: { id },
            data: { isActive: !current },
        });
        revalidatePath("/admin/schedules");
    }

    async function deleteSchedule(id: string) {
        "use server";
        await prisma.recurringSchedule.delete({ where: { id } });
        revalidatePath("/admin/schedules");
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                    <Calendar className="w-8 h-8 text-primary" />
                    Agendamentos Recorrentes
                </h1>
                <p className="text-slate-500">
                    Programe disparos automáticos baseados em horários e dias da semana.
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
                    <form action={createSchedule} className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Conta (Bot)
                                <Tooltip>
                                    <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                                    <TooltipContent>Conta que enviará as mensagens.</TooltipContent>
                                </Tooltip>
                            </label>
                            <select
                                name="botId"
                                required
                                className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Selecionar conta...</option>
                                {bots.map((b) => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Template
                                <Tooltip>
                                    <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                                    <TooltipContent>Conteúdo que será enviado.</TooltipContent>
                                </Tooltip>
                            </label>
                            <select
                                name="templateId"
                                required
                                className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">Selecionar template...</option>
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Horário
                            </label>
                            <Input name="time" type="time" required className="bg-slate-50/50 border-slate-200" />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold mb-2 block">Dias da semana</label>
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

                        <Button type="submit" className="md:col-span-4 w-full bg-primary hover:bg-primary/90">
                            Salvar Agendamento
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-slate-100">
                            <TableHead className="font-bold text-slate-700">Conta / Template</TableHead>
                            <TableHead className="font-bold text-slate-700">Horário</TableHead>
                            <TableHead className="font-bold text-slate-700">Recorrência</TableHead>
                            <TableHead className="font-bold text-slate-700">Status</TableHead>
                            <TableHead className="text-right font-bold text-slate-700">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {schedules.map((s) => (
                            <TableRow key={s.id} className={`border-slate-50 hover:bg-slate-50/30 transition-colors ${!s.isActive ? "opacity-60" : ""}`}>
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
                                        {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")}
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
                                    <form action={toggleSchedule.bind(null, s.id, s.isActive)}>
                                        <button type="submit" className="transition-transform active:scale-95">
                                            {s.isActive ? (
                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 shadow-none cursor-pointer">
                                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                                    Ativo
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-slate-400 border-slate-200 hover:bg-slate-50 cursor-pointer">
                                                    <PauseCircle className="w-3 h-3 mr-1" />
                                                    Pausado
                                                </Badge>
                                            )}
                                        </button>
                                    </form>
                                </TableCell>
                                <TableCell className="text-right">
                                    <form action={deleteSchedule.bind(null, s.id)}>
                                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </form>
                                </TableCell>
                            </TableRow>
                        ))}
                        {schedules.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">
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
