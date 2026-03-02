import { prisma } from "@/lib/prisma";
import { MessageTemplateKey, MediaType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export default async function AdminMessagesPage() {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { createdAt: "desc" },
  });

  async function createTemplate(formData: FormData) {
    "use server";
    const key = formData.get("key") as MessageTemplateKey;
    const title = formData.get("title") as string;
    const type = formData.get("type") as MediaType;
    const text = formData.get("text") as string;
    const mediaUrl = formData.get("mediaUrl") as string;
    const comboMedia = formData.get("comboMedia") as string; // text with format: type|url,type|url

    const template = await prisma.messageTemplate.create({
      data: { key, title, type, text, mediaUrl },
    });

    if (type === "COMBO" && comboMedia) {
        const items = comboMedia.split("\n").filter(Boolean).map((line, index) => {
            const [t, url] = line.trim().split("|");
            return {
                templateId: template.id,
                type: t as MediaType,
                url,
                order: index
            };
        });
        if (items.length > 0) {
            await prisma.messageTemplateMedia.createMany({ data: items });
        }
    }

    revalidatePath("/admin/messages");
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Novo Template</h3>
        <form action={createTemplate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select name="key" className="p-2 border rounded">
            {Object.values(MessageTemplateKey).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input name="title" placeholder="Título (identificação)" className="p-2 border rounded" required />
          <select name="type" className="p-2 border rounded">
            {Object.values(MediaType).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input name="mediaUrl" placeholder="URL da Mídia (se imagem/vídeo)" className="p-2 border rounded" />
          <textarea name="comboMedia" placeholder="Combo Media (Tipo|URL - uma por linha, ex: IMAGE|url)" className="p-2 border rounded md:col-span-2" rows={3} />
          <textarea name="text" placeholder="Texto da mensagem" className="p-2 border rounded md:col-span-2" rows={3} />
          <button type="submit" className="md:col-span-2 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Salvar Template
          </button>
        </form>
      </div>

      <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Key / Título</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Tipo</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                  <span className="text-xs font-mono bg-gray-100 px-1 rounded">{t.key}</span> <br />
                  {t.title}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{t.type}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {t.isActive ? "Ativo" : "Inativo"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
