import { auth } from "@/auth";
import { Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductFormDialog } from "@/components/dashboard/products/product-form-dialog";
import { ProductsDataTable } from "@/components/dashboard/products/products-data-table";
import { ProductsToolbar } from "@/components/dashboard/products/products-toolbar";
import {
    Layers3,
    Package2,
    ShoppingBag,
    Sparkles,
    Warehouse,
} from "lucide-react";
import {
    buildProductsOrderBy,
    buildProductsPageHref,
    parseProductSortField,
    parseSortDirection,
} from "./query-params";

type SearchParams = Promise<{
    page?: string;
    q?: string;
    sort?: string;
    dir?: string;
}>;

const PAGE_SIZE = 10;

type ProductRow = Prisma.ProductGetPayload<{
    include: {
        productTags: {
            include: {
                tag: true;
            };
        };
    };
}>;

function parsePage(value?: string) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        return 1;
    }

    return parsed;
}

export default async function UserProductsPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const params = await searchParams;
    const userId = session.user.id;
    const currentPage = parsePage(params.page);
    const skip = (currentPage - 1) * PAGE_SIZE;
    const searchQuery = params.q?.trim() || "";
    const sortField = parseProductSortField(params.sort);
    const sortDirection = parseSortDirection(params.dir);

    const baseWhere = {
        ownerUserId: userId,
    } as const;
    const productTableWhere: Prisma.ProductWhereInput = searchQuery
        ? {
              ...baseWhere,
              OR: [
                  {
                      title: {
                          contains: searchQuery,
                          mode: Prisma.QueryMode.insensitive,
                      },
                  },
                  {
                      description: {
                          contains: searchQuery,
                          mode: Prisma.QueryMode.insensitive,
                      },
                  },
                  {
                      category: {
                          contains: searchQuery,
                          mode: Prisma.QueryMode.insensitive,
                      },
                  },
                  {
                      productTags: {
                          some: {
                              tag: {
                                  name: {
                                      contains: searchQuery,
                                      mode: Prisma.QueryMode.insensitive,
                                  },
                              },
                          },
                      },
                  },
              ],
          }
        : baseWhere;

    const [
        products,
        filteredTotalProducts,
        totalCatalogProducts,
        deliveryProductsCount,
        subscriptionProductsCount,
        lowStockCount,
        categoryRows,
        tagRows,
    ] = await Promise.all([
        prisma.product.findMany({
            where: productTableWhere,
            include: {
                productTags: {
                    include: {
                        tag: true,
                    },
                },
            },
            orderBy: buildProductsOrderBy(sortField, sortDirection),
            skip,
            take: PAGE_SIZE,
        }),
        prisma.product.count({ where: productTableWhere }),
        prisma.product.count({ where: baseWhere }),
        prisma.product.count({
            where: {
                ...baseWhere,
                productType: ProductType.ONE_TIME,
            },
        }),
        prisma.product.count({
            where: {
                ...baseWhere,
                productType: ProductType.SUBSCRIPTION,
            },
        }),
        prisma.product.count({
            where: {
                ...baseWhere,
                stockQuantity: {
                    not: null,
                    lte: 5,
                },
            },
        }),
        prisma.product.findMany({
            where: {
                ...baseWhere,
                category: {
                    not: null,
                },
            },
            select: {
                category: true,
            },
            distinct: ["category"],
            orderBy: {
                category: "asc",
            },
        }),
        prisma.tag.findMany({
            where: {
                subscriberId: userId,
            },
            select: {
                id: true,
                name: true,
                _count: {
                    select: {
                        productTags: true,
                    },
                },
            },
            orderBy: {
                name: "asc",
            },
        }),
    ]);

    const totalPages = Math.max(1, Math.ceil(filteredTotalProducts / PAGE_SIZE));

    if (filteredTotalProducts > 0 && currentPage > totalPages) {
        redirect(
            buildProductsPageHref({
                page: totalPages,
                query: searchQuery,
                sortField,
                sortDirection,
            }),
        );
    }
    const productRows = products as ProductRow[];
    const categories = categoryRows
        .map((row) => row.category?.trim() || "")
        .filter(Boolean);
    const availableTags = tagRows.map((tag) => ({
        id: tag.id,
        name: tag.name,
        productCount: tag._count.productTags,
    }));

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                    <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900">
                        <ShoppingBag className="h-8 w-8 text-primary" />
                        Catalogo da loja
                    </h2>
                    <p className="max-w-3xl text-slate-500">
                        Gerencie o catalogo do cliente em formato de tabela, com
                        categorias, imagens e paginação para carregar apenas o
                        necessario por vez.
                    </p>
                </div>

                <ProductFormDialog
                    categories={categories}
                    availableTags={availableTags}
                />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
                            <Package2 className="h-4 w-4 text-primary" />
                            Total no catalogo
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {totalCatalogProducts}
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
                            <Sparkles className="h-4 w-4 text-primary" />
                            Produtos delivery
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {deliveryProductsCount}
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
                            <Layers3 className="h-4 w-4 text-primary" />
                            Categorias
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {categories.length}
                    </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
                            <Warehouse className="h-4 w-4 text-primary" />
                            Estoque baixo
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-3xl font-bold text-slate-900">
                        {lowStockCount}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-900">
                            Estrutura pronta para delivery e assinatura
                        </p>
                        <p className="text-sm text-slate-500">
                            Produtos avulsos entram no delivery do WhatsApp.
                            Assinaturas ficam separadas para nao poluir o contexto da
                            mercearia.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="default">
                            {deliveryProductsCount} no delivery
                        </Badge>
                        <Badge variant="outline">
                            {subscriptionProductsCount} assinaturas
                        </Badge>
                        <Badge variant="secondary">
                            {PAGE_SIZE} por pagina
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="w-full max-w-xl">
                        <ProductsToolbar initialQuery={searchQuery} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                            {filteredTotalProducts} resultado(s)
                        </Badge>
                        {searchQuery ? (
                            <Badge variant="secondary">
                                Busca: {searchQuery}
                            </Badge>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            <ProductsDataTable
                products={productRows}
                categories={categories}
                availableTags={availableTags}
                currentPage={Math.min(currentPage, totalPages)}
                totalPages={totalPages}
                totalProducts={filteredTotalProducts}
                pageSize={PAGE_SIZE}
                searchQuery={searchQuery}
                sortField={sortField}
                sortDirection={sortDirection}
            />
        </div>
    );
}
