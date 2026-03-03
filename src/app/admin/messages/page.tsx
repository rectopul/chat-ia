import { prisma } from "@/lib/prisma";
import { MessageTemplateKey, MediaType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { MultiMediaUploader } from "@/components/MultiMediaUploader"; // ajuste o caminho

export default async function AdminMessagesPage() {
    const templates = await prisma.messageTemplate.findMany({
        orderBy: { createdAt: "desc" },
        include: { media: { orderBy: { order: "asc" } } },
    });

    async function createTemplate(formData: FormData) {
        "use server";

        const key = formData.get("key") as MessageTemplateKey;
        const title = formData.get("title") as string;
        const type = formData.get("type") as MediaType;
        const text = formData.get("text") as string;

        // Coleta os itens de mídia enviados pelos inputs hidden do MultiMediaUploader
        // Formato: media[0][url], media[0][type], media[0][order], media[1][url], ...
        const mediaItems: { url: string; type: MediaType; order: number }[] =
            [];
        let i = 0;
        while (formData.has(`media[${i}][url]`)) {
            const url = formData.get(`media[${i}][url]`) as string;
            const mediaType = formData.get(`media[${i}][type]`) as MediaType;
            const order = Number(formData.get(`media[${i}][order]`) ?? i);
            if (url) mediaItems.push({ url, type: mediaType, order });
            i++;
        }

        // A primeira mídia da lista é usada também como mediaUrl principal do template
        const firstMediaUrl = mediaItems[0]?.url ?? "";

        const template = await prisma.messageTemplate.create({
            data: { key, title, type, text, mediaUrl: firstMediaUrl },
        });

        if (mediaItems.length > 0) {
            await prisma.messageTemplateMedia.createMany({
                data: mediaItems.map((m) => ({
                    ...m,
                    templateId: template.id,
                })),
            });
        }

        revalidatePath("/admin/messages");
    }

    async function deleteTemplate(templateId: string) {
        "use server";
        // Cascade deleta as mídias filhas (depende do onDelete da relation no schema)
        await prisma.messageTemplate.delete({ where: { id: templateId } });
        revalidatePath("/admin/messages");
    }

    return (
        <div className="space-y-8">
            {/* ── Formulário de criação ── */}
            <div className="bg-white p-6 rounded shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Novo Template</h3>
                <form
                    action={createTemplate}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                    {/* Key */}
                    <select name="key" className="p-2 border rounded">
                        {Object.values(MessageTemplateKey).map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>

                    {/* Título */}
                    <input
                        name="title"
                        placeholder="Título (identificação)"
                        className="p-2 border rounded"
                        required
                    />

                    {/* Tipo */}
                    <select
                        name="type"
                        className="p-2 border rounded md:col-span-2"
                    >
                        {Object.values(MediaType).map((t) => (
                            <option key={t} value={t}>
                                {t}
                            </option>
                        ))}
                    </select>

                    {/* Texto */}
                    <textarea
                        name="text"
                        placeholder="Texto da mensagem"
                        className="p-2 border rounded md:col-span-2"
                        rows={3}
                    />

                    {/* ── Upload múltiplo com drag & drop ── */}
                    <div className="md:col-span-2">
                        <p className="text-sm font-medium text-gray-700 mb-2">
                            Mídias{" "}
                            <span className="text-gray-400 font-normal">
                                (imagens, vídeos, áudios — arraste para
                                reordenar)
                            </span>
                        </p>
                        {/*
              MultiMediaUploader faz upload de cada arquivo para o Vercel Blob via Server Action,
              e injeta <input type="hidden"> no formulário com os campos:
                media[0][url], media[0][type], media[0][order]
                media[1][url], media[1][type], media[1][order]  ... etc.
              O createTemplate acima lê esses campos e salva em MessageTemplateMedia.
            */}
                        <MultiMediaUploader />
                    </div>

                    <button
                        type="submit"
                        className="md:col-span-2 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                        Salvar Template
                    </button>
                </form>
            </div>

            {/* ── Tabela de templates ── */}
            <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">
                                Key / Título
                            </th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Tipo
                            </th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Mídias
                            </th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Status
                            </th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {templates.map((t) => (
                            <tr key={t.id}>
                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                                    <span className="text-xs font-mono bg-gray-100 px-1 rounded">
                                        {t.key}
                                    </span>
                                    <br />
                                    {t.title}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {t.type}
                                </td>
                                <td className="px-3 py-4 text-sm text-gray-500">
                                    {t.media.length === 0 ? (
                                        <span className="text-gray-300">—</span>
                                    ) : (
                                        <div className="flex gap-1 flex-wrap">
                                            {t.media.map((m) => (
                                                <span
                                                    key={m.id}
                                                    className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded px-1.5 py-0.5"
                                                    title={m.url}
                                                >
                                                    {m.type === "IMAGE" && "🖼️"}
                                                    {m.type === "VIDEO" && "🎬"}
                                                    {m.type === "AUDIO" && "🎵"}
                                                    {m.type === "DOCUMENT" &&
                                                        "📄"}
                                                    {m.type}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                    {t.isActive ? (
                                        <span className="text-green-600 font-medium">
                                            Ativo
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">
                                            Inativo
                                        </span>
                                    )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-4 text-sm">
                                    <form
                                        action={deleteTemplate.bind(null, t.id)}
                                        className="inline"
                                    >
                                        <button
                                            type="submit"
                                            className="text-red-600 hover:underline text-sm"
                                        >
                                            Excluir
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
