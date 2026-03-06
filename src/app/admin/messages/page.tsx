// app/admin/messages/page.tsx
import { prisma } from "@/lib/prisma";
import { MessageTemplateKey, MediaType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { TemplateForm } from "@/components/TemplateForm";

export default async function AdminMessagesPage() {
    const templates = await prisma.messageTemplate.findMany({
        orderBy: { createdAt: "desc" },
        include: { mediaItems: true },
    });

    async function createTemplate(data: {
        key: string;
        title: string;
        type: string;
        text?: string;
        mediaUrl?: string;
        comboItems?: { type: string; url: string }[];
    }) {
        "use server";

        const template = await prisma.messageTemplate.create({
            data: {
                key: data.key as MessageTemplateKey,
                title: data.title,
                type: data.type as MediaType,
                text: data.text || null,
                mediaUrl: data.mediaUrl || null,
            },
        });

        if (
            data.type === "COMBO" &&
            data.comboItems &&
            data.comboItems.length > 0
        ) {
            await prisma.messageTemplateMedia.createMany({
                data: data.comboItems.map((item, index) => ({
                    templateId: template.id,
                    type: item.type as MediaType,
                    url: item.url,
                    order: index,
                })),
            });
        }

        revalidatePath("/admin/messages");
    }

    async function deleteTemplate(templateId: string) {
        "use server";
        await prisma.messageTemplate.delete({ where: { id: templateId } });
        revalidatePath("/admin/messages");
    }

    async function toggleTemplate(templateId: string, current: boolean) {
        "use server";
        await prisma.messageTemplate.update({
            where: { id: templateId },
            data: { isActive: !current },
        });
        revalidatePath("/admin/messages");
    }

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">
                    Templates de Mensagem
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Crie templates com texto, imagem, vídeo, áudio ou
                    combinações. Os arquivos são enviados automaticamente para o
                    Vercel Blob.
                </p>
            </div>

            {/* Formulário de criação */}
            <TemplateForm onSubmit={createTemplate} />

            {/* Tabela de templates */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Key / Título
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Tipo
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Mídias
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Status
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {templates.map((t) => (
                            <tr key={t.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4">
                                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                        {t.key}
                                    </span>
                                    <div className="text-sm font-medium text-gray-900 mt-1">
                                        {t.title}
                                    </div>
                                    {t.text && (
                                        <div className="text-xs text-gray-400 truncate max-w-xs mt-0.5">
                                            {t.text}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                                        {t.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    {t.type === "COMBO" ? (
                                        <span>
                                            {t.mediaItems.length} arquivo(s)
                                        </span>
                                    ) : t.mediaUrl ? (
                                        <a
                                            href={t.mediaUrl}
                                            target="_blank"
                                            className="text-indigo-500 hover:underline text-xs"
                                        >
                                            Ver mídia
                                        </a>
                                    ) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <form
                                        action={toggleTemplate.bind(
                                            null,
                                            t.id,
                                            t.isActive,
                                        )}
                                    >
                                        <button
                                            type="submit"
                                            className={`text-xs font-medium px-2 py-1 rounded-full ${
                                                t.isActive
                                                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                            }`}
                                        >
                                            {t.isActive ? "Ativo" : "Inativo"}
                                        </button>
                                    </form>
                                </td>
                                <td className="px-6 py-4">
                                    <form
                                        action={deleteTemplate.bind(null, t.id)}
                                        className="inline"
                                    >
                                        <button
                                            type="submit"
                                            className="text-red-500 hover:underline text-sm font-medium"
                                        >
                                            Excluir
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        ))}
                        {templates.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-6 py-12 text-center text-sm text-gray-400"
                                >
                                    Nenhum template criado ainda.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
