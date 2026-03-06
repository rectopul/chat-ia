import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { BotConnectionManager } from "@/components/BotConnectionManager";
import { BotTokenEditor } from "@/components/BotTokenEditor";

export default async function AdminBotsPage() {
    const bots = await prisma.botAccount.findMany({
        orderBy: { createdAt: "desc" },
    });

    async function createBot(formData: FormData) {
        "use server";
        const name = formData.get("name") as string;
        const phoneNumber = formData.get("phoneNumber") as string;
        const apiId = parseInt(formData.get("apiId") as string);
        const apiHash = formData.get("apiHash") as string;

        await prisma.botAccount.create({
            data: {
                name,
                phoneNumber,
                apiId,
                apiHash,
                isUserAccount: true,
                isActive: false,
            },
        });

        revalidatePath("/admin/bots");
    }

    async function saveToken(botId: string, token: string) {
        "use server";
        await prisma.botAccount.update({
            where: { id: botId },
            data: { businessBotToken: token || null },
        });
        revalidatePath("/admin/bots");
    }

    async function toggleBot(botId: string, currentStatus: boolean) {
        "use server";
        await prisma.botAccount.update({
            where: { id: botId },
            data: { isActive: !currentStatus },
        });
        revalidatePath("/admin/bots");
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            {/* ── Formulário de cadastro ── */}
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100">
                <h3 className="text-xl font-bold mb-1 text-gray-800">
                    Cadastrar Nova Conta
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                    Após salvar, você poderá adicionar o token do bot auxiliar
                    diretamente na tabela.
                </p>

                <form
                    action={createBot}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Nome da Instância
                        </label>
                        <input
                            name="name"
                            placeholder="Ex: Minha Conta Pessoal"
                            className="w-full p-2 border rounded-lg text-sm"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            Telefone
                        </label>
                        <input
                            name="phoneNumber"
                            placeholder="+5511999999999"
                            className="w-full p-2 border rounded-lg text-sm"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            API ID
                            <span className="ml-1 text-xs text-gray-400 font-normal">
                                (my.telegram.org)
                            </span>
                        </label>
                        <input
                            name="apiId"
                            type="number"
                            placeholder="1234567"
                            className="w-full p-2 border rounded-lg text-sm"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">
                            API Hash
                            <span className="ml-1 text-xs text-gray-400 font-normal">
                                (my.telegram.org)
                            </span>
                        </label>
                        <input
                            name="apiHash"
                            placeholder="abcdef123456..."
                            className="w-full p-2 border rounded-lg text-sm"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="md:col-span-2 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition text-sm"
                    >
                        Salvar Conta
                    </button>
                </form>
            </div>

            {/* ── Tabela de contas ── */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Usuário
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Business Bot Token
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Conexão MTProto
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {bots.map((bot) => (
                            <tr key={bot.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4">
                                    <div className="text-sm font-bold text-gray-900">
                                        {bot.name}
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">
                                        {bot.phoneNumber}
                                    </div>
                                </td>

                                {/* Coluna editável inline */}
                                <td className="px-6 py-4 w-80">
                                    <BotTokenEditor
                                        botId={bot.id}
                                        currentToken={
                                            bot.businessBotToken ?? ""
                                        }
                                        onSave={saveToken}
                                    />
                                </td>

                                <td className="px-6 py-4">
                                    <BotConnectionManager bot={bot} />
                                </td>

                                <td className="px-6 py-4 text-sm">
                                    <form
                                        action={toggleBot.bind(
                                            null,
                                            bot.id,
                                            bot.isActive,
                                        )}
                                    >
                                        <button
                                            type="submit"
                                            className={`font-medium hover:underline ${
                                                bot.isActive
                                                    ? "text-red-600"
                                                    : "text-green-600"
                                            }`}
                                        >
                                            {bot.isActive
                                                ? "Desconectar"
                                                : "Conectar"}
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
