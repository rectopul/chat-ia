import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import axios from "axios";

export default async function AdminBotsPage() {
  const bots = await prisma.botAccount.findMany({
    orderBy: { createdAt: "desc" },
  });

  async function createBot(formData: FormData) {
    "use server";
    const name = formData.get("name") as string;
    const token = formData.get("token") as string;
    const webhookSecret = formData.get("webhookSecret") as string;

    await prisma.botAccount.create({
      data: { name, token, webhookSecret },
    });
    revalidatePath("/admin/bots");
  }

  async function setWebhook(botId: string) {
    "use server";
    const bot = await prisma.botAccount.findUnique({ where: { id: botId } });
    if (!bot) return;

    const webhookUrl = `${process.env.APP_BASE_URL}/api/telegram/webhook/${bot.id}?secret=${bot.webhookSecret}`;

    try {
        await axios.post(`https://api.telegram.org/bot${bot.token}/setWebhook`, {
            url: webhookUrl
        });
        console.log(`Webhook set for bot ${bot.name}`);
    } catch (error) {
        console.error(`Error setting webhook for bot ${bot.name}:`, error);
    }
  }

  async function toggleBot(botId: string, current: boolean) {
    "use server";
    await prisma.botAccount.update({
        where: { id: botId },
        data: { isActive: !current }
    });
    revalidatePath("/admin/bots");
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Adicionar Novo Bot</h3>
        <form action={createBot} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input name="name" placeholder="Nome do Bot (ex: Bot VIP 1)" className="p-2 border rounded" required />
          <input name="token" placeholder="Bot Token do BotFather" className="p-2 border rounded" required />
          <input name="webhookSecret" placeholder="Webhook Secret (qualquer string)" className="p-2 border rounded" required />
          <button type="submit" className="md:col-span-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Salvar Bot
          </button>
        </form>
      </div>

      <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Nome / Token</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {bots.map((bot) => (
              <tr key={bot.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                  {bot.name} <br />
                  <span className="text-xs text-gray-500 font-mono">{bot.token.substring(0, 10)}...</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {bot.isActive ? "Ativo" : "Inativo"}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 space-x-2">
                    <form action={setWebhook.bind(null, bot.id)} className="inline">
                        <button type="submit" className="text-blue-600 hover:underline">Configurar Webhook</button>
                    </form>
                    <form action={toggleBot.bind(null, bot.id, bot.isActive)} className="inline">
                        <button type="submit" className="text-orange-600 hover:underline">
                            {bot.isActive ? "Desativar" : "Ativar"}
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
