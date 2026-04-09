"use client";

import { useActionState, useEffect, useState } from "react";
import { ProductType } from "@prisma/client";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createUserProductAction } from "@/app/dashboard/products/actions";
import { initialCreateProductFormState } from "@/app/dashboard/products/form-state";
import { ProductCategoryCombobox } from "./product-category-combobox";

type ProductFormDialogProps = {
    categories: string[];
};

function CreateProductForm({
    categories,
    onSuccess,
}: ProductFormDialogProps & {
    onSuccess: () => void;
}) {
    const [productType, setProductType] = useState<ProductType>(ProductType.ONE_TIME);
    const [category, setCategory] = useState("");
    const [state, submitAction, isPending] = useActionState(
        createUserProductAction,
        initialCreateProductFormState,
    );

    useEffect(() => {
        if (state.status !== "success") {
            return;
        }

        toast.success("Produto cadastrado com sucesso.");
        onSuccess();
    }, [onSuccess, state.status]);

    return (
        <form action={submitAction} className="grid gap-5">
            {state.formError && state.status === "error" && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {state.formError}
                </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
                <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="title">Nome do produto</Label>
                    <Input
                        id="title"
                        name="title"
                        placeholder="Ex.: Coca-Cola 2L"
                        required
                    />
                    {state.fieldErrors.title && (
                        <p className="text-sm text-destructive">
                            {state.fieldErrors.title}
                        </p>
                    )}
                </div>

                <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="description">Descricao</Label>
                    <Textarea
                        id="description"
                        name="description"
                        rows={3}
                        placeholder="Detalhes que ajudam o cliente e a IA a vender melhor."
                    />
                    {state.fieldErrors.description && (
                        <p className="text-sm text-destructive">
                            {state.fieldErrors.description}
                        </p>
                    )}
                </div>

                <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="imageUrl">Imagem do produto</Label>
                    <Input
                        id="imageUrl"
                        name="imageUrl"
                        type="url"
                        placeholder="https://..."
                    />
                    <p className="text-xs text-muted-foreground">
                        Use uma URL publica da imagem para exibir no painel e no
                        contexto da IA.
                    </p>
                    {state.fieldErrors.imageUrl && (
                        <p className="text-sm text-destructive">
                            {state.fieldErrors.imageUrl}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label>Categoria</Label>
                    <ProductCategoryCombobox
                        categories={categories}
                        value={category}
                        onChange={setCategory}
                    />
                    <input type="hidden" name="category" value={category} />
                    {state.fieldErrors.category && (
                        <p className="text-sm text-destructive">
                            {state.fieldErrors.category}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label>Tipo</Label>
                    <Select
                        value={productType}
                        onValueChange={(value) =>
                            setProductType(value as ProductType)
                        }
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ProductType.ONE_TIME}>
                                Produto avulso
                            </SelectItem>
                            <SelectItem value={ProductType.SUBSCRIPTION}>
                                Assinatura
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <input type="hidden" name="productType" value={productType} />
                    {state.fieldErrors.productType && (
                        <p className="text-sm text-destructive">
                            {state.fieldErrors.productType}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="price">Preco</Label>
                    <Input
                        id="price"
                        name="price"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0,00"
                        required
                    />
                    {state.fieldErrors.price && (
                        <p className="text-sm text-destructive">
                            {state.fieldErrors.price}
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="stockQuantity">Estoque</Label>
                    <Input
                        id="stockQuantity"
                        name="stockQuantity"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Deixe vazio para estoque livre"
                    />
                    {state.fieldErrors.stockQuantity && (
                        <p className="text-sm text-destructive">
                            {state.fieldErrors.stockQuantity}
                        </p>
                    )}
                </div>

                {productType === ProductType.SUBSCRIPTION && (
                    <div className="grid gap-2 md:col-span-2">
                        <Label htmlFor="subscriberDays">Duracao da assinatura</Label>
                        <Input
                            id="subscriberDays"
                            name="subscriberDays"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Quantidade de dias"
                        />
                        {state.fieldErrors.subscriberDays && (
                            <p className="text-sm text-destructive">
                                {state.fieldErrors.subscriberDays}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
                <Button type="submit" disabled={isPending}>
                    {isPending ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Salvando...
                        </>
                    ) : (
                        <>
                            <PackagePlus className="h-4 w-4" />
                            Salvar produto
                        </>
                    )}
                </Button>
            </DialogFooter>
        </form>
    );
}

export function ProductFormDialog({ categories }: ProductFormDialogProps) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <PackagePlus className="h-4 w-4" />
                    Novo produto
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Novo produto</DialogTitle>
                    <DialogDescription>
                        Cadastre itens da loja com categoria, imagem e dados prontos
                        para o delivery no WhatsApp.
                    </DialogDescription>
                </DialogHeader>

                {open ? (
                    <CreateProductForm
                        categories={categories}
                        onSuccess={() => setOpen(false)}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
