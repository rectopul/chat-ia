import { prisma } from "@/lib/prisma";
import { ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  async function createProduct(formData: FormData) {
    "use server";
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const priceCents = Math.round(parseFloat(formData.get("price") as string) * 100);
    const productType = formData.get("productType") as ProductType;
    const subscriberDays = formData.get("subscriberDays") ? parseInt(formData.get("subscriberDays") as string) : null;

    await prisma.product.create({
      data: { title, description, priceCents, productType, subscriberDays },
    });
    revalidatePath("/admin/products");
  }

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Novo Produto</h3>
        <form action={createProduct} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input name="title" placeholder="Título do Produto" className="p-2 border rounded" required />
          <input name="price" type="number" step="0.01" placeholder="Preço (ex: 49.90)" className="p-2 border rounded" required />
          <select name="productType" className="p-2 border rounded">
            {Object.values(ProductType).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input name="subscriberDays" type="number" placeholder="Dias de Assinatura (se aplicável)" className="p-2 border rounded" />
          <textarea name="description" placeholder="Descrição" className="p-2 border rounded md:col-span-2" rows={2} />
          <button type="submit" className="md:col-span-2 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Salvar Produto
          </button>
        </form>
      </div>

      <div className="bg-white overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Título / Tipo</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Preço</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                  {p.title} <br />
                  <span className="text-xs text-gray-500">{p.productType}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">R$ {p.priceCents / 100}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {p.isActive ? "Ativo" : "Inativo"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
