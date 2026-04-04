import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
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
import { ShoppingBag, Trash2 } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    createUserProductAction,
    deleteUserProductAction,
} from "./actions";

export default async function UserProductsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    const userId = session.user.id;
    const products = await prisma.product.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: "desc" },
    });

    return (
        <div className="space-y-8">
            <div className="space-y-2">
                <h2 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-slate-900">
                    <ShoppingBag className="w-8 h-8 text-primary" />
                    Meus produtos
                </h2>
                <p className="text-slate-500">
                    Cadastre os planos e packs que o seu bot vai vender.
                </p>
            </div>

            <Card className="border-none shadow-sm">
                <CardHeader>
                    <CardTitle>Novo produto</CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={createUserProductAction} className="grid gap-4 md:grid-cols-3">
                        <input
                            name="title"
                            placeholder="Titulo"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <input
                            name="price"
                            type="number"
                            step="0.01"
                            placeholder="49.90"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                            required
                        />
                        <Select name="productType" defaultValue="ONE_TIME">
                            <SelectTrigger className="h-10 w-full border-slate-200 bg-slate-50">
                                <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ONE_TIME">Compra unica</SelectItem>
                                <SelectItem value="SUBSCRIPTION">Assinatura</SelectItem>
                            </SelectContent>
                        </Select>
                        <input
                            name="subscriberDays"
                            type="number"
                            placeholder="Dias da assinatura"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3"
                        />
                        <input
                            name="description"
                            placeholder="Descricao ou link do produto"
                            className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 md:col-span-2"
                        />
                        <Button type="submit" className="md:col-span-3">
                            Salvar produto
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-50/50">
                        <TableRow>
                            <TableHead>Titulo</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Preco</TableHead>
                            <TableHead className="text-right">Acoes</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.map((product) => (
                            <TableRow key={product.id}>
                                <TableCell>
                                    <div className="font-semibold text-slate-900">
                                        {product.title}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {product.description || "Sem descricao"}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary">
                                        {product.productType}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {`R$ ${(product.priceCents / 100).toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                    })}`}
                                </TableCell>
                                <TableCell className="text-right">
                                    <form action={deleteUserProductAction}>
                                        <input type="hidden" name="id" value={product.id} />
                                        <Button size="sm" variant="outline">
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Excluir
                                        </Button>
                                    </form>
                                </TableCell>
                            </TableRow>
                        ))}
                        {products.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-slate-400 italic">
                                    Nenhum produto cadastrado para este tenant.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
