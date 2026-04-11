"use client";

import { useState, useTransition } from "react";
import { Prisma } from "@prisma/client";
import {
    MoreHorizontal,
    Pencil,
    Power,
    Tags,
    Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    deleteUserProductAction,
    toggleUserProductActiveAction,
} from "@/app/dashboard/products/actions";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductEditDialog } from "./product-form-dialog";
import { ProductTagOption } from "./product-tags-input";
import { ProductTagsDialog } from "./product-tags-dialog";

type ProductRowActionsProps = {
    product: Prisma.ProductGetPayload<{
        include: {
            productTags: {
                include: {
                    tag: true;
                };
            };
        };
    }>;
    categories: string[];
    availableTags: ProductTagOption[];
};

export function ProductRowActions({
    product,
    categories,
    availableTags,
}: ProductRowActionsProps) {
    const router = useRouter();
    const [editOpen, setEditOpen] = useState(false);
    const [tagsOpen, setTagsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleToggleStatus = () => {
        startTransition(async () => {
            try {
                await toggleUserProductActiveAction(product.id, product.isActive);
                toast.success(
                    product.isActive
                        ? "Produto desativado com sucesso."
                        : "Produto ativado com sucesso.",
                );
                router.refresh();
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel alterar o status do produto.",
                );
            }
        });
    };

    const handleDelete = () => {
        if (!window.confirm(`Excluir o produto "${product.title}"?`)) {
            return;
        }

        startTransition(async () => {
            try {
                const formData = new FormData();

                formData.set("id", product.id);
                await deleteUserProductAction(formData);
                toast.success("Produto excluido com sucesso.");
                router.refresh();
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel excluir o produto.",
                );
            }
        });
    };

    return (
        <>
            <ProductEditDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                product={product}
                categories={categories}
                availableTags={availableTags}
            />
            <ProductTagsDialog
                open={tagsOpen}
                onOpenChange={setTagsOpen}
                productId={product.id}
                productTitle={product.title}
                currentTags={product.productTags.map((entry) => entry.tag.name)}
                availableTags={availableTags}
            />

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        disabled={isPending}
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                        onSelect={(event) => {
                            event.preventDefault();
                            setEditOpen(true);
                        }}
                    >
                        <Pencil className="h-4 w-4" />
                        Editar produto
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(event) => {
                            event.preventDefault();
                            setTagsOpen(true);
                        }}
                    >
                        <Tags className="h-4 w-4" />
                        Gerenciar tags
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(event) => {
                            event.preventDefault();
                            handleToggleStatus();
                        }}
                    >
                        <Power className="h-4 w-4" />
                        {product.isActive ? "Desativar produto" : "Ativar produto"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onSelect={(event) => {
                            event.preventDefault();
                            handleDelete();
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                        Excluir produto
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}
