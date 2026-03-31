"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, "Informe a senha atual."),
        newPassword: z
            .string()
            .min(8, "A nova senha deve ter pelo menos 8 caracteres."),
        confirmPassword: z.string().min(1, "Confirme a nova senha."),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "A confirmação da nova senha não confere.",
        path: ["confirmPassword"],
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
        message: "A nova senha deve ser diferente da senha atual.",
        path: ["newPassword"],
    });

export type ChangePasswordState = {
    error: string | null;
    success: string | null;
    fieldErrors?: {
        currentPassword?: string[];
        newPassword?: string[];
        confirmPassword?: string[];
    };
};

export async function changePasswordAction(
    _prevState: ChangePasswordState | undefined,
    formData: FormData,
): Promise<ChangePasswordState> {
    const session = await auth();

    if (!session?.user?.email) {
        return {
            error: "Sessão inválida. Faça login novamente.",
            success: null,
        };
    }

    const parsed = changePasswordSchema.safeParse({
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword: String(formData.get("newPassword") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });

    if (!parsed.success) {
        return {
            error: "Revise os campos do formulário.",
            success: null,
            fieldErrors: parsed.error.flatten().fieldErrors,
        };
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
            id: true,
            password: true,
        },
    });

    if (!user?.password) {
        return {
            error: "Usuário sem senha cadastrada.",
            success: null,
        };
    }

    const isCurrentPasswordValid = await bcrypt.compare(
        parsed.data.currentPassword,
        user.password,
    );

    if (!isCurrentPasswordValid) {
        return {
            error: "A senha atual está incorreta.",
            success: null,
            fieldErrors: {
                currentPassword: ["A senha atual está incorreta."],
            },
        };
    }

    const hashedPassword = await bcrypt.hash(parsed.data.newPassword, 10);

    await prisma.user.update({
        where: { id: user.id },
        data: {
            password: hashedPassword,
        },
    });

    return {
        error: null,
        success: "Senha alterada com sucesso.",
    };
}
