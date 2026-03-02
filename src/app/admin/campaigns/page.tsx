import { prisma } from "@/lib/prisma";
import { UserSegment } from "@prisma/client";
import { revalidatePath } from "next/cache";

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

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Nova Regra de Mensagem Agendada</h3>
        <form action={createRule} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input name="name" placeholder="Nome da Regra" className="p-2 border rounded" required />
          <select name="botId" className="p-2 border rounded" required>
            <option value="">Selecionar Bot</option>
            {bots.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <input name="delaySeconds" type="number" placeholder="Delay em segundos (ex: 3600 para 1h)" className="p-2 border rounded" required />
          <input name="repeatIntervalSeconds" type="number" placeholder="Repetir a cada X segundos (opcional)" className="p-2 border rounded" />
          <select name="segment" className="p-2 border rounded">
            {Object.values(UserSegment).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select name="templateId" className="p-2 border rounded">
            <option value="">Selecionar Template TIMED</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <button type="submit" className="md:col-span-2 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Salvar Regra
          </button>
        </form>
      </div>

      <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Bot / Nome / Segmento</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Delay / Repetição</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Template</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                  <span className="text-xs text-blue-600 font-bold">{r.bot.name}</span> <br />
                  {r.name} <br />
                  <span className="text-xs text-gray-500">{r.segment}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    Delay: {r.delaySeconds}s <br />
                    Repete: {r.repeatIntervalSeconds ? `${r.repeatIntervalSeconds}s` : "Não"}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{r.template.title}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm space-x-2">
                    <form action={deleteRule.bind(null, r.id)} className="inline">
                        <button type="submit" className="text-red-600 hover:underline">Excluir</button>
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
