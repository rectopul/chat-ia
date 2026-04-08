import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Product, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Package2,
    ShoppingBag,
    Sparkles,
    Tags,
    Trash2,
} from "lucide-react";
import {
    createUserProductAction,
    deleteUserProductAction,
    toggleUserProductActiveAction,
} from "./actions";

function formatMoney(valueCents: number) {
    return `R$ ${(valueCents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
    })}`;
}

function getStockLabel(stockQuantity: number | null) {
    if (stockQuantity === null) {
        return "Estoque livre";
    }

    if (stockQuantity <= 0) {
        return "Sem estoque";
    }

    return `${stockQuantity} unid.`;
}

function getGroupedProducts(products: Product[]) {
    const groupedProducts = new Map<string, Product[]>();

    for (const product of products) {
        const category = product.category?.trim() || "Sem categoria";
        const current = groupedProducts.get(category) ?? [];
        groupedProducts.set(category, [...current, product]);
    }

    return [...groupedProducts.entries()];
}

function ProductGroupSection({
    title,
    description,
    products,
    emptyStateTitle,
    emptyStateDescription,
}: {
    title: string;
    description: string;
    products: Product[];
    emptyStateTitle: string;
    emptyStateDescription: string;
}) {
    if (!products.length) {
        return (
            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <p className="text-sm text-slate-500">{description}</p>
                </CardHeader>
                <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                    <div className="rounded-full bg-slate-100 p-4 text-slate-500">
                        <Package2 className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-semibold text-slate-900">
                            {emptyStateTitle}
                        </p>
                        <p className="text-sm text-slate-500">
                            {emptyStateDescription}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h3 className="text-2xl font-semibold tracking-tight text-slate-900">
                    {title}
                </h3>
                <p className="text-sm text-slate-500">{description}</p>
            </div>

            {getGroupedProducts(products).map(([category, categoryProducts]) => (
                <Card key={`${title}-${category}`} className="border-none shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Tags className="h-5 w-5 text-primary" />
                                {category}
                            </CardTitle>
                            <p className="text-sm text-slate-500">
                                {categoryProducts.length} produto(s) nesta categoria.
                            </p>
                        </div>
                        <Badge variant="outline">
                            {categoryProducts.length} item(ns)
                        </Badge>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {categoryProducts.map((product) => (
                            <div
                                key={product.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-lg font-semibold text-slate-900">
                                            {product.title}
                                        </p>
                                        <p className="text-sm text-slate-500">
                                            {product.description ||
                                                "Sem descricao cadastrada."}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            product.isActive ? "default" : "outline"
                                        }
                                    >
                                        {product.isActive ? "Ativo" : "Inativo"}
                                    </Badge>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Badge variant="secondary">
                                        {product.productType === ProductType.SUBSCRIPTION
                                            ? "Assinatura"
                                            : "Avulso"}
                                    </Badge>
                                    <Badge variant="outline">
                                        {getStockLabel(product.stockQuantity)}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={
                                            product.productType === ProductType.ONE_TIME
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                : "border-slate-200 bg-white text-slate-600"
                                        }
                                    >
                                        {product.productType === ProductType.ONE_TIME
                                            ? "No delivery WhatsApp"
                                            : "Fora do delivery"}
                                    </Badge>
                                </div>

                                <div className="mt-4 flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                                            Preco
                                        </p>
                                        <p className="text-2xl font-bold text-slate-900">
                                            {formatMoney(product.priceCents)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <form
                                            action={toggleUserProductActiveAction.bind(
                                                null,
                                                product.id,
                                                product.isActive,
                                            )}
                                        >
                                            <Button size="sm" variant="outline">
                                                {product.isActive
                                                    ? "Desativar"
                                                    : "Ativar"}
                                            </Button>
                                        </form>
                                        <form action={deleteUserProductAction}>
                                            <input
                                                type="hidden"
                                                name="id"
                                                value={product.id}
                                            />
                                            <Button size="sm" variant="outline">
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                Excluir
                                            </Button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export default async function UserProductsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const userId = session.user.id;
    const products = await prisma.product.findMany({
        where: { ownerUserId: userId },
        orderBy: [
            { productType: "asc" },
            { category: "asc" },
            { createdAt: "desc" },
        ],
    });

    const deliveryProducts = products.filter(
        (product) => product.productType === ProductType.ONE_TIME,
    );
    const subscriptionProducts = products.filter(
        (product) => product.productType === ProductType.SUBSCRIPTION,
    );
    const deliveryCategoryCount = new Set(
        deliveryProducts.map((product) => product.category?.trim() || "Sem categoria"),
    ).size;
    const lowStockCount = deliveryProducts.filter(
        (product) =>
            product.stockQuantity !== null && product.stockQuantity <= 5,
    ).length;

    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900">
                    <ShoppingBag className="h-8 w-8 text-primary" />
                    Catalogo da loja
                </h2>
                <p className="max-w-3xl text-slate-500">
                    Organize o que a IA da mercearia pode vender no WhatsApp e
                    mantenha seus produtos separados das ofertas de assinatura.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Catalogo do delivery
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {deliveryProducts.length}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Categorias no delivery
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {deliveryCategoryCount}
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-slate-500">
                            Estoque baixo no delivery
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {lowStockCount}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <CardTitle>Isolamento do catalogo</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                    <p>
                        Somente os produtos marcados como{" "}
                        <strong>Venda avulsa</strong> entram no catalogo que o
                        atendente do WhatsApp consulta para delivery.
                    </p>
                    <p>
                        Produtos marcados como <strong>Assinatura</strong>{" "}
                        ficam separados e nao aparecem nas respostas da
                        mercearia, evitando misturar itens como planos e
                        assinaturas com produtos da loja.
                    </p>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle>Novo produto</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        action={createUserProductAction}
                        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
                    >
                        <input
                            name="title"
                            placeholder="Nome do produto"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <input
                            name="category"
                            placeholder="Categoria"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                        />
                        <input
                            name="price"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="9.90"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <input
                            name="stockQuantity"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Estoque"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                        />
                        <select
                            name="productType"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                        >
                            <option value={ProductType.ONE_TIME}>
                                Venda avulsa
                            </option>
                            <option value={ProductType.SUBSCRIPTION}>
                                Assinatura
                            </option>
                        </select>
                        <input
                            name="subscriberDays"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Dias da assinatura"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                        />
                        <input
                            name="description"
                            placeholder="Descricao curta"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 md:col-span-2"
                        />
                        <Button type="submit" className="xl:justify-self-start">
                            Salvar produto
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <ProductGroupSection
                title="Catalogo do WhatsApp Delivery"
                description="Estes itens sao usados pelo carrinho temporario, busca de produtos e respostas da IA da mercearia."
                products={deliveryProducts}
                emptyStateTitle="Nenhum item de delivery cadastrado ainda"
                emptyStateDescription="Cadastre produtos como venda avulsa para o atendente do WhatsApp consultar preco, estoque e categoria."
            />

            <ProductGroupSection
                title="Ofertas e assinaturas"
                description="Itens desta area ficam fora do catalogo do delivery e nao sao oferecidos pelo atendente da mercearia no WhatsApp."
                products={subscriptionProducts}
                emptyStateTitle="Nenhuma assinatura cadastrada ainda"
                emptyStateDescription="Use esta secao para produtos recorrentes, clubes ou ofertas que nao devem entrar no fluxo de delivery."
            />
        </div>
    );
}
