"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { z } from "zod";

export type LoginPrevState = {
    status: "idle" | "success" | "error";
    formError: string | null;
    fieldErrors: {
        email?: string;
        password?: string;
    };
    values: {
        email: string;
    };
};

const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .min(1, "Informe o seu e-mail.")
        .email("Informe um e-mail valido."),
    password: z
        .string()
        .min(1, "Informe a sua senha.")
        .max(128, "A senha informada e muito longa."),
});

export async function actionLogin(
    _prevState: LoginPrevState | undefined,
    formData: FormData,
) {
    const rawValues = {
        email: String(formData.get("email") ?? "").trim(),
        password: String(formData.get("password") ?? ""),
    };
    const parsed = loginSchema.safeParse(rawValues);

    if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors;

        return {
            status: "error" as const,
            formError: "Revise os campos destacados para entrar.",
            fieldErrors: {
                email: fieldErrors.email?.[0],
                password: fieldErrors.password?.[0],
            },
            values: {
                email: rawValues.email,
            },
        };
    }

    try {
        await signIn("credentials", {
            email: parsed.data.email,
            password: parsed.data.password,
            redirect: false,
        });

        return {
            status: "success" as const,
            formError: null,
            fieldErrors: {},
            values: {
                email: parsed.data.email,
            },
        };
    } catch (error: unknown) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case "CredentialsSignin":
                case "CallbackRouteError":
                    return {
                        status: "error" as const,
                        formError: "E-mail ou senha incorretos.",
                        fieldErrors: {},
                        values: {
                            email: rawValues.email,
                        },
                    };
                default:
                    return {
                        status: "error" as const,
                        formError:
                            "Nao foi possivel autenticar agora. Tente novamente em instantes.",
                        fieldErrors: {},
                        values: {
                            email: rawValues.email,
                        },
                    };
            }
        }

        return {
            status: "error" as const,
            formError:
                "Erro interno ao autenticar. Se persistir, verifique a configuracao do servidor.",
            fieldErrors: {},
            values: {
                email: rawValues.email,
            },
        };
    }
}
