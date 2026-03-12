import { prisma } from "@/lib/prisma";
import { UserSegment } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  Zap,
  Plus,
  Info,
  Clock,
  Users,
  Repeat,
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

export default async function AdminCampaignsPage() {
  const [rules, templates, bots] = await prisma.$transaction([
    prisma.timedMessageRule.findMany({ include: { template: true, bot: true } }),
    prisma.messageTemplate.findMany({ where: { key: "TIMED" } }),
    prisma.botAccount.findMany({ where: { isActive: true } }),
  ]);

  async function createRule(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const botId = formData.get("botId") as string;
    const delaySeconds = parseInt(formData.get("delaySeconds") as string);
    const repeatIntervalSeconds = formData.get("repeatIntervalSeconds") ? parseInt(formData.get("repeatIntervalSeconds") as string) : null;
    const segment = formData.get("segment") as UserSegment;
    const templateId = formData.get("templateId") as string;

    await prisma.timedMessageRule.create({
      data: { name, botId, delaySeconds, repeatIntervalSeconds, segment, templateId },
    });
    revalidatePath("/admin/campaigns");
  }

  async function deleteRule(ruleId: string) {
    "use server";
    await prisma.timedMessageRule.delete({ where: { id: ruleId } });
    revalidatePath("/admin/campaigns");
  }

  const segmentLabels: Record<UserSegment, string> = {
    ALL: "Todos",
    NEW_USERS: "Novos Usuários",
    BUYERS: "Compradores",
    NON_BUYERS: "Não Compradores"
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
          <Zap className="w-8 h-8 text-amber-500 fill-amber-500" />
          Campanhas Timed
        </h1>
        <p className="text-slate-500">Regras de disparo automático baseadas em tempo de interação ou eventos.</p>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            <CardTitle>Nova Regra de Mensagem</CardTitle>
          </div>
          <CardDescription>Defina quando e para quem as mensagens serão enviadas automaticamente.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createRule} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Nome da Regra</label>
              <Input name="name" placeholder="Ex: Boas-vindas 1h" required className="bg-slate-50/50 border-slate-200" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Conta (Bot)</label>
              <select name="botId" required className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">Selecionar Bot</option>
                {bots.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                Segmento de Usuário
                <Tooltip>
                  <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                  <TooltipContent>Público-alvo desta regra.</TooltipContent>
                </Tooltip>
              </label>
              <select name="segment" className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                {Object.values(UserSegment).map((s) => (
                  <option key={s} value={s}>{segmentLabels[s]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                Delay (segundos)
                <Tooltip>
                  <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                  <TooltipContent>Tempo de espera após o primeiro contato.</TooltipContent>
                </Tooltip>
              </label>
              <Input name="delaySeconds" type="number" placeholder="Ex: 3600 (1h)" required className="bg-slate-50/50 border-slate-200" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2">
                Repetir a cada (segundos)
                <Tooltip>
                    <TooltipTrigger asChild><Info className="w-3.5 h-3.5 text-slate-400" /></TooltipTrigger>
                    <TooltipContent>Deixe vazio para disparo único.</TooltipContent>
                </Tooltip>
              </label>
              <Input name="repeatIntervalSeconds" type="number" placeholder="Opcional" className="bg-slate-50/50 border-slate-200" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Template TIMED</label>
              <select name="templateId" required className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">Selecionar Template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            <Button type="submit" className="md:col-span-3 w-full bg-primary hover:bg-primary/90 mt-2">
              Criar Regra de Campanha
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="hover:bg-transparent border-slate-100">
              <TableHead className="font-bold text-slate-700">Regra / Segmento</TableHead>
              <TableHead className="font-bold text-slate-700">Configuração</TableHead>
              <TableHead className="font-bold text-slate-700">Template</TableHead>
              <TableHead className="text-right font-bold text-slate-700">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} className="border-slate-50 hover:bg-slate-50/30 transition-colors">
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-wider">
                        <Bot className="w-3 h-3" />
                        {r.bot.name}
                    </div>
                    <div className="font-bold text-slate-900">{r.name}</div>
                    <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] h-5 bg-slate-100 text-slate-600 hover:bg-slate-100 shadow-none border-none">
                            <Users className="w-3 h-3 mr-1" />
                            {segmentLabels[r.segment]}
                        </Badge>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Delay: <span className="font-mono font-medium">{r.delaySeconds}s</span>
                    </div>
                    {r.repeatIntervalSeconds && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                            <Repeat className="w-3.5 h-3.5 text-slate-400" />
                            Ciclo: <span className="font-mono font-medium">{r.repeatIntervalSeconds}s</span>
                        </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                    <FileText className="w-4 h-4 text-slate-400" />
                    {r.template.title}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <form action={deleteRule.bind(null, r.id)}>
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {rules.length === 0 && (
                <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-slate-400 italic">
                        Nenhuma regra configurada ainda.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
