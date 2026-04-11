"use client";

import { ReactNode, useState, useTransition } from "react";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import { updateUserProductTagsAction } from "@/app/dashboard/products/actions";
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
import { ProductTagOption, ProductTagsInput } from "./product-tags-input";

type ProductTagsDialogProps = {
    productId: string;
    productTitle: string;
    currentTags: string[];
    availableTags: ProductTagOption[];
    trigger?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

export function ProductTagsDialog({
    productId,
    productTitle,
    currentTags,
    availableTags,
    trigger,
    open,
    onOpenChange,
}: ProductTagsDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [tags, setTags] = useState(currentTags);
    const [isPending, startTransition] = useTransition();
    const isControlled = typeof open === "boolean";
    const isOpen = isControlled ? open : internalOpen;

    const handleOpenChange = (nextOpen: boolean) => {
        if (!isControlled) {
            setInternalOpen(nextOpen);
        }

        onOpenChange?.(nextOpen);

        if (nextOpen) {
            setTags(currentTags);
        }
    };

    const handleSave = () => {
        startTransition(async () => {
            try {
                const formData = new FormData();

                formData.set("productId", productId);
                formData.set("tags", JSON.stringify(tags));
                await updateUserProductTagsAction(formData);
                toast.success("Tags atualizadas com sucesso.");
                handleOpenChange(false);
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Nao foi possivel atualizar as tags.",
                );
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            {trigger ? (
                <DialogTrigger asChild>{trigger}</DialogTrigger>
            ) : (
                <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                        <Tags className="h-4 w-4" />
                        Tags
                    </Button>
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Gerenciar tags</DialogTitle>
                    <DialogDescription>
                        Ajuste as tags do produto <strong>{productTitle}</strong>{" "}
                        para melhorar busca, catalogo e recomendacoes no
                        WhatsApp.
                    </DialogDescription>
                </DialogHeader>

                <ProductTagsInput
                    availableTags={availableTags}
                    value={tags}
                    onChange={setTags}
                />

                <DialogFooter>
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={isPending}
                    >
                        {isPending ? "Salvando..." : "Salvar tags"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
