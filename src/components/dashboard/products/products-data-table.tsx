import Link from "next/link";
import { Prisma, ProductType } from "@prisma/client";
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    ChevronLeft,
    ChevronRight,
    Image as ImageIcon,
    PackageSearch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    ProductSortField,
    SortDirection,
    buildProductsPageHref,
} from "@/app/dashboard/products/query-params";
import { ProductRowActions } from "./product-row-actions";
import { ProductTagOption } from "./product-tags-input";

type ProductsDataTableProps = {
    products: Prisma.ProductGetPayload<{
        include: {
            productTags: {
                include: {
                    tag: true;
                };
            };
        };
    }>[];
    categories: string[];
    availableTags: ProductTagOption[];
    currentPage: number;
    totalPages: number;
    totalProducts: number;
    pageSize: number;
    searchQuery: string;
    sortField: ProductSortField;
    sortDirection: SortDirection;
};

function formatMoney(valueCents: number) {
    return `R$ ${(valueCents / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function hasPromotionalPrice(product: ProductsDataTableProps["products"][number]) {
    return (
        typeof product.promotionalPriceCents === "number" &&
        product.promotionalPriceCents > 0 &&
        product.promotionalPriceCents < product.priceCents
    );
}

function formatStock(stockQuantity: number | null) {
    if (stockQuantity === null) {
        return "Livre";
    }

    if (stockQuantity <= 0) {
        return "Sem estoque";
    }

    return `${stockQuantity} unid.`;
}

function formatDate(date: Date) {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

function buildPageHref(input: {
    page: number;
    query: string;
    sortField: ProductSortField;
    sortDirection: SortDirection;
}) {
    return buildProductsPageHref(input);
}

function SortIndicator({
    active,
    direction,
}: {
    active: boolean;
    direction: SortDirection;
}) {
    if (!active) {
        return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />;
    }

    return direction === "asc" ? (
        <ArrowUp className="h-3.5 w-3.5 text-primary" />
    ) : (
        <ArrowDown className="h-3.5 w-3.5 text-primary" />
    );
}

function SortableHead({
    label,
    field,
    searchQuery,
    currentSortField,
    currentSortDirection,
}: {
    label: string;
    field: ProductSortField;
    searchQuery: string;
    currentSortField: ProductSortField;
    currentSortDirection: SortDirection;
}) {
    const isActive = currentSortField === field;
    const nextDirection =
        isActive && currentSortDirection === "asc" ? "desc" : "asc";
    const href = buildProductsPageHref({
        page: 1,
        query: searchQuery,
        sortField: field,
        sortDirection: nextDirection,
    });

    return (
        <TableHead>
            <Link
                href={href}
                className="inline-flex items-center gap-1.5 text-slate-600 transition hover:text-slate-900"
            >
                <span>{label}</span>
                <SortIndicator active={isActive} direction={currentSortDirection} />
            </Link>
        </TableHead>
    );
}

function ProductImagePreview({
    imageUrl,
    title,
}: {
    imageUrl: string | null;
    title: string;
}) {
    if (!imageUrl) {
        return (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-400">
                <ImageIcon className="h-4 w-4" />
            </div>
        );
    }

    return (
        <div
            className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-100 bg-cover bg-center"
            style={{ backgroundImage: `url("${imageUrl}")` }}
            aria-label={`Imagem do produto ${title}`}
        />
    );
}

export function ProductsDataTable({
    products,
    categories,
    availableTags,
    currentPage,
    totalPages,
    totalProducts,
    pageSize,
    searchQuery,
    sortField,
    sortDirection,
}: ProductsDataTableProps) {
    if (!products.length) {
        return (
            <Card className="border-none shadow-sm">
                <CardContent className="flex min-h-80 flex-col items-center justify-center gap-4 text-center">
                    <div className="rounded-full bg-slate-100 p-4 text-slate-500">
                        <PackageSearch className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-semibold text-slate-900">
                            {searchQuery
                                ? "Nenhum produto encontrado"
                                : "Nenhum produto cadastrado ainda"}
                        </p>
                        <p className="max-w-md text-sm text-slate-500">
                            {searchQuery
                                ? "Tente outro termo de busca ou ajuste a ordenacao para localizar o item desejado."
                                : (
                                      <>
                                          Use o botao{" "}
                                          <span className="font-medium">
                                              Novo produto
                                          </span>{" "}
                                          para montar o catalogo da loja e alimentar o
                                          atendimento no WhatsApp.
                                      </>
                                  )}
                        </p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const firstItemIndex = (currentPage - 1) * pageSize + 1;
    const lastItemIndex = Math.min(currentPage * pageSize, totalProducts);

    return (
        <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <CardTitle className="text-xl">Lista de produtos</CardTitle>
                    <p className="text-sm text-slate-500">
                        Exibindo {firstItemIndex} a {lastItemIndex} de{" "}
                        {totalProducts} produto(s).
                    </p>
                </div>
                <Badge variant="outline">
                    Pagina {currentPage} de {Math.max(totalPages, 1)}
                </Badge>
            </CardHeader>

            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-slate-50/70">
                        <TableRow>
                            <SortableHead
                                label="Produto"
                                field="title"
                                searchQuery={searchQuery}
                                currentSortField={sortField}
                                currentSortDirection={sortDirection}
                            />
                            <SortableHead
                                label="Categoria"
                                field="category"
                                searchQuery={searchQuery}
                                currentSortField={sortField}
                                currentSortDirection={sortDirection}
                            />
                            <TableHead>Tags</TableHead>
                            <TableHead>Tipo</TableHead>
                            <SortableHead
                                label="Preco"
                                field="price"
                                searchQuery={searchQuery}
                                currentSortField={sortField}
                                currentSortDirection={sortDirection}
                            />
                            <SortableHead
                                label="Estoque"
                                field="stock"
                                searchQuery={searchQuery}
                                currentSortField={sortField}
                                currentSortDirection={sortDirection}
                            />
                            <SortableHead
                                label="Status"
                                field="status"
                                searchQuery={searchQuery}
                                currentSortField={sortField}
                                currentSortDirection={sortDirection}
                            />
                            <SortableHead
                                label="Criado em"
                                field="createdAt"
                                searchQuery={searchQuery}
                                currentSortField={sortField}
                                currentSortDirection={sortDirection}
                            />
                            <TableHead className="text-right">Acoes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.map((product) => (
                            <TableRow key={product.id}>
                                <TableCell className="align-top">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <ProductImagePreview
                                            imageUrl={product.imageUrl}
                                            title={product.title}
                                        />
                                        <div className="min-w-0 space-y-1">
                                            <div className="font-semibold text-slate-900">
                                                {product.title}
                                            </div>
                                            <p className="line-clamp-2 max-w-md whitespace-normal text-sm text-slate-500">
                                                {product.description ||
                                                    "Sem descricao cadastrada."}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary">
                                        {product.category?.trim() || "Sem categoria"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="align-top">
                                    <div className="flex max-w-xs flex-wrap gap-1.5">
                                        {product.productTags.length ? (
                                            product.productTags.map((entry) => (
                                                <Badge
                                                    key={entry.tag.id}
                                                    variant="outline"
                                                    className="rounded-full"
                                                >
                                                    {entry.tag.name}
                                                </Badge>
                                            ))
                                        ) : (
                                            <span className="text-sm text-slate-400">
                                                Sem tags
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="space-y-2">
                                        <Badge
                                            variant={
                                                product.productType ===
                                                ProductType.ONE_TIME
                                                    ? "default"
                                                    : "outline"
                                            }
                                        >
                                            {product.productType ===
                                            ProductType.ONE_TIME
                                                ? "Avulso"
                                                : "Assinatura"}
                                        </Badge>
                                        {product.productType ===
                                            ProductType.SUBSCRIPTION &&
                                            product.subscriberDays && (
                                                <p className="text-xs text-slate-500">
                                                    {product.subscriberDays} dias
                                                </p>
                                            )}
                                    </div>
                                </TableCell>
                                <TableCell className="align-top">
                                    {hasPromotionalPrice(product) ? (
                                        <div className="space-y-1">
                                            <p className="font-semibold text-emerald-700">
                                                {formatMoney(
                                                    product.promotionalPriceCents!,
                                                )}
                                            </p>
                                            <p className="text-xs text-slate-400 line-through">
                                                {formatMoney(product.priceCents)}
                                            </p>
                                        </div>
                                    ) : (
                                        <span className="font-medium text-slate-900">
                                            {formatMoney(product.priceCents)}
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={
                                            product.stockQuantity !== null &&
                                            product.stockQuantity <= 5
                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                : ""
                                        }
                                    >
                                        {formatStock(product.stockQuantity)}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={product.isActive ? "default" : "outline"}
                                    >
                                        {product.isActive ? "Ativo" : "Inativo"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-slate-500">
                                    {formatDate(product.createdAt)}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end">
                                        <ProductRowActions
                                            product={product}
                                            categories={categories}
                                            availableTags={availableTags}
                                        />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-500">
                        Carregando {products.length} item(ns) por pagina para reduzir
                        o consumo do banco de dados.
                    </p>
                    <div className="flex items-center gap-2">
                        {currentPage <= 1 ? (
                            <Button variant="outline" size="sm" disabled>
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </Button>
                        ) : (
                            <Button asChild variant="outline" size="sm">
                                <Link
                                    href={buildPageHref({
                                        page: currentPage - 1,
                                        query: searchQuery,
                                        sortField,
                                        sortDirection,
                                    })}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Anterior
                                </Link>
                            </Button>
                        )}

                        {currentPage >= totalPages ? (
                            <Button variant="outline" size="sm" disabled>
                                Proxima
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button asChild variant="outline" size="sm">
                                <Link
                                    href={buildPageHref({
                                        page: currentPage + 1,
                                        query: searchQuery,
                                        sortField,
                                        sortDirection,
                                    })}
                                >
                                    Proxima
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
