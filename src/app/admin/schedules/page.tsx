// app/admin/schedules/page.tsx
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">
                    Agendamentos Recorrentes
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    As mensagens serão disparadas automaticamente para todos os
                    usuários ativos do bot no horário configurado.
                </p>
            </div>

            {/* ── Formulário ── */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-5">
                    Novo Agendamento
                </h3>
                <form
                    action={createSchedule}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Conta (Bot)
                        </label>
                        <select
                            name="botId"
                            className="w-full p-2 border rounded-lg text-sm"
                            required
                        >
                            <option value="">Selecionar conta...</option>
                            {bots.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Template
                        </label>
                        <select
                            name="templateId"
                            className="w-full p-2 border rounded-lg text-sm"
                            required
                        >
                            <option value="">Selecionar template...</option>
                            {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Horário
                        </label>
                        <input
                            name="time"
                            type="time"
                            className="w-full p-2 border rounded-lg text-sm"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                            Dias da semana
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {DAY_LABELS.map((label, d) => (
                                <label
                                    key={d}
                                    className="flex flex-col items-center gap-1 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        name="weekDays"
                                        value={d}
                                        defaultChecked
                                        className="accent-indigo-600"
                                    />
                                    <span className="text-xs text-gray-600">
                                        {label}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="md:col-span-2 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition text-sm"
                    >
                        Salvar Agendamento
                    </button>
                </form>
            </div>

            {/* ── Tabela ── */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Conta / Template
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Horário
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Dias
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
                        {schedules.map((s) => (
                            <tr
                                key={s.id}
                                className={`hover:bg-gray-50 ${!s.isActive ? "opacity-50" : ""}`}
                            >
                                <td className="px-6 py-4">
                                    <div className="text-sm font-bold text-gray-900">
                                        {s.bot.name}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {s.template.title}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm font-mono font-medium text-gray-800">
                                        {String(s.hour).padStart(2, "0")}:
                                        {String(s.minute).padStart(2, "0")}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-1 flex-wrap">
                                        {DAY_LABELS.map((label, d) => (
                                            <span
                                                key={d}
                                                className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                                    s.weekDays.includes(d)
                                                        ? "bg-indigo-100 text-indigo-700"
                                                        : "bg-gray-100 text-gray-300"
                                                }`}
                                            >
                                                {label}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <form
                                        action={toggleSchedule.bind(
                                            null,
                                            s.id,
                                            s.isActive,
                                        )}
                                    >
                                        <button
                                            type="submit"
                                            className={`text-xs font-medium px-2 py-1 rounded-full transition ${
                                                s.isActive
                                                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                            }`}
                                        >
                                            {s.isActive ? "Ativo" : "Pausado"}
                                        </button>
                                    </form>
                                </td>
                                <td className="px-6 py-4">
                                    <form
                                        action={deleteSchedule.bind(null, s.id)}
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
                        {schedules.length === 0 && (
                            <tr>
                                <td
                                    colSpan={5}
                                    className="px-6 py-12 text-center text-sm text-gray-400"
                                >
                                    Nenhum agendamento criado ainda.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
