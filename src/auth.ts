import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getAccessSummary } from "@/lib/saas/access";

const AUTH_SILENT_ERROR_CODES = new Set(["CredentialsSignin"]);

export const { handlers, signIn, signOut, auth } = NextAuth({
    session: {
        strategy: "jwt",
    },
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                try {
                    if (!credentials?.email || !credentials?.password) {
                        return null;
                    }

                    const user = await prisma.user.findUnique({
                        where: { email: credentials.email as string },
                        include: { subscription: true },
                    });

                    if (!user) {
                        return null;
                    }

                    if (!user || !user.password) return null;

                    const isValid = await bcrypt.compare(
                        credentials.password as string,
                        user.password,
                    );

                    if (!isValid) return null;

                    const access = getAccessSummary({
                        role: user.role,
                        accessStatus: user.accessStatus,
                        subscription: user.subscription,
                        aiMessageLimitOverride: user.aiMessageLimitOverride,
                    });

                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        accessStatus: user.accessStatus,
                        planType: access.planType,
                        subscriptionStatus: user.subscription?.status ?? null,
                        hasActiveAccess: access.hasActiveAccess,
                    };
                } catch (error) {
                    console.error("Erro ao autorizar usuário:", error);
                    return null;
                }
            },
        }),
    ],
    pages: {
        signIn: "/login",
    },
    logger: {
        error(code, ...message) {
            if (AUTH_SILENT_ERROR_CODES.has(String(code))) {
                return;
            }

            console.error(`[auth][error] ${code}`, ...message);
        },
    },
    callbacks: {
        async jwt({ token, user }) {
            const userId =
                typeof user?.id === "string"
                    ? user.id
                    : typeof token.sub === "string"
                      ? token.sub
                      : null;

            if (!userId) {
                return token;
            }

            const dbUser = await prisma.user.findUnique({
                where: { id: userId },
                include: { subscription: true },
            });

            if (!dbUser) {
                return token;
            }

            const access = getAccessSummary({
                role: dbUser.role,
                accessStatus: dbUser.accessStatus,
                subscription: dbUser.subscription,
                aiMessageLimitOverride: dbUser.aiMessageLimitOverride,
            });

            token.sub = dbUser.id;
            token.name = dbUser.name;
            token.email = dbUser.email;
            token.role = dbUser.role;
            token.accessStatus = dbUser.accessStatus;
            token.planType = access.planType;
            token.subscriptionStatus = dbUser.subscription?.status ?? null;
            token.hasActiveAccess = access.hasActiveAccess;
            token.isSuperAdmin = access.isSuperAdmin;

            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = String(token.sub ?? "");
                session.user.role = token.role;
                session.user.accessStatus = token.accessStatus;
                session.user.planType = token.planType;
                session.user.subscriptionStatus = token.subscriptionStatus;
                session.user.hasActiveAccess = Boolean(token.hasActiveAccess);
                session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
            }

            return session;
        },
    },
});
