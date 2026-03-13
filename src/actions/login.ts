"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export type LoginPrevState = {
    error: string | null;
    message: string | null;
};

export async function actionLogin(
    prevState: LoginPrevState | undefined,
    formData: FormData,
) {
    try {
        const email = String(formData.get("email") ?? "");
        const password = String(formData.get("password") ?? "");
        await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        return {
            error: null,
            message: "success",
        };
    } catch (error: any) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case "CredentialsSignin":
                    return {
                        error: "Usuário ou senha inválidos.",
                        message: null,
                    };
                default:
                    return {
                        error: "Falha ao autenticar.",
                        message: null,
                    };
            }
        }

        return {
            error: "Erro interno ao autenticar.",
            message: error.message as string,
        };
    }
}
