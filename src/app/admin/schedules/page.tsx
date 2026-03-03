import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export default async function AdminSchedulesPage() {
  const [schedules, bots, templates] = await prisma.$transaction([
    prisma.recurringSchedule.findMany({ include: { bot: true, template: true } }),
    prisma.botAccount.findMany({ where: { isActive: true } }),
    prisma.messageTemplate.findMany(),
  ]);

  async function createSchedule(formData: FormData) {
    "use server";
    const botId = formData.get("botId") as string;
    const templateId = formData.get("templateId") as string;
    const time = formData.get("time") as string; // HH:mm
    const [hour, minute] = time.split(":").map(Number);
    const weekDays = formData.getAll("weekDays").map(Number);

    await prisma.recurringSchedule.create({
      data: { botId, templateId, hour, minute, weekDays },
    });
    revalidatePath("/admin/schedules");
  }

  async function deleteSchedule(id: string) {
    "use server";
    await prisma.recurringSchedule.delete({ where: { id } });
    revalidatePath("/admin/schedules");
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Programar Mensagem Diária</h3>
        <form action={createSchedule} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select name="botId" className="p-2 border rounded" required>
            <option value="">Selecionar Conta</option>
            {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select name="templateId" className="p-2 border rounded" required>
            <option value="">Selecionar Template</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <input name="time" type="time" className="p-2 border rounded" required />
          <div className="flex gap-2 items-center">
            <span className="text-sm">Dias:</span>
            {[0,1,2,3,4,5,6].map(d => (
                <label key={d} className="text-xs">
                    <input type="checkbox" name="weekDays" value={d} defaultChecked /> {['D','S','T','Q','Q','S','S'][d]}
                </label>
            ))}
          </div>
          <button type="submit" className="md:col-span-2 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Salvar Agendamento
          </button>
        </form>
      </div>

      <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Conta / Template</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Horário</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {schedules.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                  {s.bot.name} <br />
                  <span className="text-xs text-gray-500">{s.template.title}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {String(s.hour).padStart(2, '0')}:{String(s.minute).padStart(2, '0')} <br />
                    <span className="text-xs">Dias: {s.weekDays.join(',')}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm space-x-2">
                    <form action={deleteSchedule.bind(null, s.id)} className="inline">
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
