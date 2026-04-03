// app/admin/messages/page.tsx
import { prisma } from "@/lib/prisma";
import { TemplateForm } from "@/components/TemplateForm";
import {
    MessageSquare,
    FileText,
    Layers,
    CheckCircle2,
    PauseCircle,
    Trash2,
    ExternalLink,
    Eye,
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    createAdminTemplateAction,
    deleteAdminTemplateAction,
    toggleAdminTemplateAction,
} from "./actions";

export default async function AdminMessagesPage() {
    const templates = await prisma.messageTemplate.findMany({
        orderBy: { createdAt: "desc" },
        include: { mediaItems: true },
    });

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                    <MessageSquare className="w-8 h-8 text-primary" />
                    Templates de Mensagem
                </h1>
                <p className="text-slate-500">
                    Gerencie o conteúdo das mensagens enviadas pelos seus bots.
                </p>
            </div>

            <TemplateForm onSubmit={createAdminTemplateAction} />

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-slate-100">
                            <TableHead className="font-bold text-slate-700">
                                Key / Título
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Tipo
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Conteúdo
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
                        {templates.map((t) => {
                            const mediaTags = [
                                ...new Set(
                                    t.mediaItems.flatMap(
                                        (item) => item.tags ?? [],
                                    ),
                                ),
                            ];

                            return (
                                <TableRow
                                    key={t.id}
                                    className="border-slate-50 hover:bg-slate-50/30 transition-colors"
                                >
                                    <TableCell className="max-w-[300px]">
                                        <div className="flex flex-col gap-1.5">
                                            <Badge
                                                variant="outline"
                                                className="w-fit text-[9px] font-bold uppercase tracking-wider py-0 px-1.5 border-slate-200 text-slate-500"
                                            >
                                                {t.key}
                                            </Badge>
                                            <div className="text-sm font-bold text-slate-900 mt-0.5">
                                                {t.title}
                                            </div>
                                            {t.text && (
                                                <div className="text-xs text-slate-400 line-clamp-1 italic">
                                                    "{t.text}"
                                                </div>
                                            )}
                                            {t.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 pt-1">
                                                    {t.tags.map((tag) => (
                                                        <Badge
                                                            key={`${t.id}-${tag}`}
                                                            variant="outline"
                                                            className="border-pink-100 text-pink-700 bg-pink-50 text-[10px]"
                                                        >
                                                            #{tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-50 shadow-none font-bold text-[10px]">
                                            {t.type === "COMBO" ? (
                                                <Layers className="w-3 h-3 mr-1" />
                                            ) : (
                                                <FileText className="w-3 h-3 mr-1" />
                                            )}
                                            {t.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {t.type === "COMBO" ? (
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                                    <span className="w-5 h-5 bg-slate-100 rounded flex items-center justify-center font-mono text-[10px] text-slate-600">
                                                        {t.mediaItems.length}
                                                    </span>
                                                    arquivos
                                                </div>
                                                {mediaTags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {mediaTags.map((tag) => (
                                                            <Badge
                                                                key={`${t.id}-media-${tag}`}
                                                                variant="outline"
                                                                className="border-amber-100 text-amber-700 bg-amber-50 text-[10px]"
                                                            >
                                                                midia:{tag}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : t.mediaUrl ? (
                                            <a
                                                href={t.mediaUrl}
                                                target="_blank"
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline group"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                Visualizar
                                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </a>
                                        ) : (
                                            <span className="text-slate-300 text-xs">
                                                —
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <form
                                            action={toggleAdminTemplateAction.bind(
                                                null,
                                                t.id,
                                                t.isActive,
                                            )}
                                        >
                                            <button
                                                type="submit"
                                                className="transition-transform active:scale-95"
                                            >
                                                {t.isActive ? (
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
                                            action={deleteAdminTemplateAction.bind(
                                                null,
                                                t.id,
                                            )}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-slate-300 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </form>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {templates.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-32 text-center text-slate-400 italic"
                                >
                                    Nenhum template criado ainda.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
