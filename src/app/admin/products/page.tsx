import { prisma } from "@/lib/prisma";
import { ProductType } from "@prisma/client";
import { ShoppingBag, Plus, Info, Tag, Calendar, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
    createAdminProductAction,
    deleteAdminProductAction,
} from "./actions";

export default async function AdminProductsPage() {
    const products = await prisma.product.findMany({
        orderBy: { createdAt: "desc" },
    });

    const typeLabels: Record<ProductType, string> = {
        ONE_TIME: "Compra Única",
        SUBSCRIPTION: "Assinatura",
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                    <ShoppingBag className="w-8 h-8 text-primary" />
                    Produtos
                </h1>
                <p className="text-slate-500">
                    Configure os itens que seus bots podem vender através do
                    PIX.
                </p>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-primary" />
                        <CardTitle>Novo Produto</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <form
                        action={createAdminProductAction}
                        className="grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">
                                Título do Produto
                            </label>
                            <Input
                                name="title"
                                placeholder="Ex: Acesso VIP"
                                required
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Preço (R$)
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Valor que será cobrado no checkout PIX.
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="price"
                                type="number"
                                step="0.01"
                                placeholder="49.90"
                                required
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold">
                                Tipo
                            </label>
                            <select
                                name="productType"
                                className="w-full h-10 px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                {Object.values(ProductType).map((t) => (
                                    <option key={t} value={t}>
                                        {typeLabels[t]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                Dias de Assinatura
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="w-3.5 h-3.5 text-slate-400" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Tempo de acesso concedido (apenas para
                                        assinaturas).
                                    </TooltipContent>
                                </Tooltip>
                            </label>
                            <Input
                                name="subscriberDays"
                                type="number"
                                placeholder="Ex: 30"
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-semibold">
                                Link
                            </label>
                            <Input
                                name="description"
                                placeholder="Link do produto a ser baixado"
                                className="bg-slate-50/50 border-slate-200"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="md:col-span-3 w-full bg-primary hover:bg-primary/90"
                        >
                            Salvar Produto
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow className="hover:bg-transparent border-slate-100">
                            <TableHead className="font-bold text-slate-700">
                                Título / Tipo
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Preço
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Configuração
                            </TableHead>
                            <TableHead className="font-bold text-slate-700">
                                Status
                            </TableHead>
                            <TableHead className="font-bold text-slate-700 w-16" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.map((p) => (
                            <TableRow
                                key={p.id}
                                className="border-slate-50 hover:bg-slate-50/30 transition-colors"
                            >
                                <TableCell>
                                    <div className="font-bold text-slate-900">
                                        {p.title}
                                    </div>
                                    <div className="text-xs text-slate-500 line-clamp-1">
                                        {p.description || "Sem descrição"}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="secondary"
                                        className="bg-slate-100 text-slate-700 border-none font-mono"
                                    >
                                        R${" "}
                                        {(p.priceCents / 100).toLocaleString(
                                            "pt-BR",
                                            {
                                                minimumFractionDigits: 2,
                                            },
                                        )}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <Tag className="w-3.5 h-3.5 text-slate-400" />
                                        {typeLabels[p.productType]}
                                        {p.productType === "SUBSCRIPTION" && (
                                            <span className="flex items-center gap-1 ml-2">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                {p.subscriberDays} dias
                                            </span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {p.isActive ? (
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 shadow-none">
                                            Ativo
                                        </Badge>
                                    ) : (
                                        <Badge
                                            variant="outline"
                                            className="text-slate-400 border-slate-200 hover:bg-transparent"
                                        >
                                            Inativo
                                        </Badge>
                                    )}
                                </TableCell>

                                {/* ✅ Botão de excluir */}
                                <TableCell>
                                    <form action={deleteAdminProductAction}>
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={p.id}
                                        />
                                        <Button
                                            type="submit"
                                            variant="ghost"
                                            size="icon"
                                            className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </form>
                                </TableCell>
                            </TableRow>
                        ))}
                        {products.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="h-32 text-center text-slate-400 italic"
                                >
                                    Nenhum produto cadastrado.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
