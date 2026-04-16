"use server";

import bcrypt from "bcryptjs";
import {
    PlanType,
    Prisma,
    SubscriptionStatus,
    UserAccessStatus,
    UserRole,
} from "@prisma/client";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhoneDigits } from "@/lib/phone";
import { z } from "zod";

export type RegisterPrevState = {
    status: "idle" | "success" | "error";
    formError: string | null;
    fieldErrors: {
        name?: string;
        email?: string;
        phone?: string;
        password?: string;
        confirmPassword?: string;
        acceptTerms?: string;
    };
    values: {
        name: string;
        email: string;
        phone: string;
        acceptTerms: boolean;
    };
};

const registerSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(3, "Informe seu nome completo.")
            .max(120, "Seu nome esta muito longo."),
        email: z
            .string()
            .trim()
            .min(1, "Informe o seu e-mail.")
            .email("Informe um e-mail valido."),
        phone: z
            .string()
            .transform((value) => normalizePhoneDigits(value))
            .refine(
                (value) => value.length === 10 || value.length === 11,
                "Informe um telefone valido com DDD.",
            ),
        password: z
            .string()
            .min(8, "A senha deve ter pelo menos 8 caracteres.")
            .max(128, "A senha informada e muito longa.")
            .refine(
                (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
                "A senha precisa ter pelo menos uma letra e um numero.",
            ),
        confirmPassword: z.string(),
        acceptTerms: z.boolean().refine(Boolean, {
            message: "Voce precisa aceitar os termos para continuar.",
        }),
    })
    .refine((data) => data.password === data.confirmPassword, {
        path: ["confirmPassword"],
        message: "As senhas nao coincidem.",
    });

export async function actionRegister(
    _prevState: RegisterPrevState | undefined,
    formData: FormData,
) {
    const rawValues = {
        name: String(formData.get("name") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
        confirmPassword: String(formData.get("confirmPassword") ?? ""),
        acceptTerms:
            String(formData.get("acceptTerms") ?? "").trim() === "1",
    };

    const parsed = registerSchema.safeParse(rawValues);

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;

        return {
            status: "error" as const,
            formError: "Revise os campos destacados para concluir seu cadastro.",
            fieldErrors: {
                name: fieldErrors.name?.[0],
                email: fieldErrors.email?.[0],
                phone: fieldErrors.phone?.[0],
                password: fieldErrors.password?.[0],
                confirmPassword: fieldErrors.confirmPassword?.[0],
                acceptTerms: fieldErrors.acceptTerms?.[0],
            },
            values: {
                name: rawValues.name,
                email: rawValues.email,
                phone: rawValues.phone,
                acceptTerms: rawValues.acceptTerms,
            },
        };
    }

    const data = parsed.data;
    const passwordHash = await bcrypt.hash(data.password, 12);

    try {
        await prisma.$transaction(async (tx) => {
            const duplicatedUser = await tx.user.findFirst({
                where: {
                    OR: [{ email: data.email }, { phone: data.phone }],
                },
                select: {
                    email: true,
                    phone: true,
                },
            });

            if (duplicatedUser?.email === data.email) {
                throw new Error("EMAIL_ALREADY_EXISTS");
            }

            if (duplicatedUser?.phone === data.phone) {
                throw new Error("PHONE_ALREADY_EXISTS");
            }

            const user = await tx.user.create({
                data: {
                    name: data.name,
                    email: data.email,
                    phone: data.phone,
                    password: passwordHash,
                    role: UserRole.CUSTOMER,
                    accessStatus: UserAccessStatus.ACTIVE,
                    termsAcceptedAt: new Date(),
                },
            });

            await tx.subscription.create({
                data: {
                    userId: user.id,
                    planType: PlanType.FREE,
                    status: SubscriptionStatus.ACTIVE,
                    planPriceCents: 0,
                },
            });
        });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "EMAIL_ALREADY_EXISTS") {
                return {
                    status: "error" as const,
                    formError: "Ja existe uma conta cadastrada com este e-mail.",
                    fieldErrors: {
                        email: "Use outro e-mail ou entre com sua conta.",
                    },
                    values: {
                        name: rawValues.name,
                        email: rawValues.email,
                        phone: rawValues.phone,
                        acceptTerms: rawValues.acceptTerms,
                    },
                };
            }

            if (error.message === "PHONE_ALREADY_EXISTS") {
                return {
                    status: "error" as const,
                    formError:
                        "Ja existe uma conta cadastrada com este telefone.",
                    fieldErrors: {
                        phone: "Use outro telefone ou entre com sua conta.",
                    },
                    values: {
                        name: rawValues.name,
                        email: rawValues.email,
                        phone: rawValues.phone,
                        acceptTerms: rawValues.acceptTerms,
                    },
                };
            }
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const target = Array.isArray(error.meta?.target)
                ? error.meta.target.join(",")
                : String(error.meta?.target ?? "");
            const isPhoneConflict = target.includes("phone");

            return {
                status: "error" as const,
                formError: isPhoneConflict
                    ? "Ja existe uma conta cadastrada com este telefone."
                    : "Ja existe uma conta cadastrada com este e-mail.",
                fieldErrors: isPhoneConflict
                    ? { phone: "Use outro telefone ou entre com sua conta." }
                    : { email: "Use outro e-mail ou entre com sua conta." },
                values: {
                    name: rawValues.name,
                    email: rawValues.email,
                    phone: rawValues.phone,
                    acceptTerms: rawValues.acceptTerms,
                },
            };
        }

        return {
            status: "error" as const,
            formError:
                "Nao foi possivel concluir seu cadastro agora. Tente novamente em instantes.",
            fieldErrors: {},
            values: {
                name: rawValues.name,
                email: rawValues.email,
                phone: rawValues.phone,
                acceptTerms: rawValues.acceptTerms,
            },
        };
    }

    await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
    });

    return {
        status: "success" as const,
        formError: null,
        fieldErrors: {},
        values: {
            name: data.name,
            email: data.email,
            phone: rawValues.phone,
            acceptTerms: data.acceptTerms,
        },
    };
}
