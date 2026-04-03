import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { TemplateForm } from "@/components/TemplateForm";
import { MessageTemplateKey, MediaType } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { MessageSquare, Trash2 } from "lucide-react";

export default async function UserMessagesPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const userId = session.user.id;
    const templates = await prisma.messageTemplate.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: "desc" },
        include: { mediaItems: true },
    });

    async function createTemplate(data: {
        key: string;
        title: string;
        type: string;
        text?: string;
        mediaUrl?: string;
        tags?: string[];
        comboItems?: { type: string; url: string; tags?: string[] }[];
    }) {
        "use server";
        const session = await auth();
        if (!session?.user?.id) redirect("/login");

        const template = await prisma.messageTemplate.create({
            data: {
                ownerUserId: session.user.id,
                key: data.key as MessageTemplateKey,
                title: data.title,
                type: data.type as MediaType,
                text: data.text || null,
                mediaUrl: data.mediaUrl || null,
                tags: data.tags ?? [],
            },
        });

        if (data.type === "COMBO" && data.comboItems?.length) {
            await prisma.messageTemplateMedia.createMany({
                data: data.comboItems.map((item, index) => ({
                    templateId: template.id,
                    type: item.type as MediaType,
                    url: item.url,
                    order: index,
                    tags: item.tags ?? [],
                })),
            });
        }

        revalidatePath("/dashboard/messages");
    }

    async function deleteTemplate(templateId: string) {
        "use server";
        const session = await auth();
        if (!session?.user?.id) redirect("/login");

        await prisma.messageTemplate.deleteMany({
            where: {
                id: templateId,
                ownerUserId: session.user.id,
            },
        });

        revalidatePath("/dashboard/messages");
    }

    async function toggleTemplate(templateId: string, current: boolean) {
        "use server";
        const session = await auth();
        if (!session?.user?.id) redirect("/login");

        await prisma.messageTemplate.updateMany({
            where: {
                id: templateId,
                ownerUserId: session.user.id,
            },
            data: { isActive: !current },
        });
        revalidatePath("/dashboard/messages");
    }

    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900">
                    <MessageSquare className="w-8 h-8 text-primary" />
                    Meus conteudos
                </h2>
                <p className="text-slate-500">
                    Crie e gerencie os templates e as previas usadas pelo seu
                    proprio tenant.
                </p>
            </div>

            <TemplateForm onSubmit={createTemplate} />

            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead>Titulo</TableHead>
                            <TableHead>Key</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Acoes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {templates.map((template) => (
                            <TableRow key={template.id}>
                                <TableCell>
                                    <div className="font-semibold text-slate-900">
                                        {template.title}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {template.text || template.mediaUrl || "Conteudo salvo"}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">{template.key}</Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{template.type}</Badge>
                                </TableCell>
                                <TableCell>
                                    <form action={toggleTemplate.bind(null, template.id, template.isActive)}>
                                        <Button size="sm" variant={template.isActive ? "outline" : "default"}>
                                            {template.isActive ? "Desativar" : "Ativar"}
                                        </Button>
                                    </form>
                                </TableCell>
                                <TableCell className="text-right">
                                    <form action={deleteTemplate.bind(null, template.id)}>
                                        <Button size="sm" variant="outline">
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Excluir
                                        </Button>
                                    </form>
                                </TableCell>
                            </TableRow>
                        ))}
                        {templates.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-slate-400 italic">
                                    Nenhum template cadastrado para este tenant.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
