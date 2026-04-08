"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserAccessStatus } from "@prisma/client";
import {
    setSaasUserAccessStatus,
    setSaasUserAiLimitOverride,
} from "@/lib/saas/server";
import { requireSuperAdminUser } from "@/lib/server-session";

export async function updateTenantAccessAction(formData: FormData) {
    await requireSuperAdminUser();

    const userId = String(formData.get("userId") ?? "");
    const accessStatus = String(formData.get("accessStatus") ?? "");

    if (
        !userId ||
        !Object.values(UserAccessStatus).includes(
            accessStatus as UserAccessStatus,
        )
    ) {
        return;
    }

    await setSaasUserAccessStatus(userId, accessStatus as UserAccessStatus);
    revalidatePath("/admin/tenants");
}

const tenantAiLimitSchema = z.object({
    userId: z.string().trim().min(1),
    aiMessageLimitOverride: z
        .string()
        .trim()
        .transform((value) => {
            if (!value) {
                return null;
            }

            const parsed = Number(value);

            if (!Number.isInteger(parsed) || parsed < 0) {
                throw new Error("invalid-ai-limit");
            }

            return parsed;
        }),
});

export async function updateTenantAiLimitAction(formData: FormData) {
    await requireSuperAdminUser();

    try {
        const parsed = tenantAiLimitSchema.parse({
            userId: String(formData.get("userId") ?? ""),
            aiMessageLimitOverride: String(
                formData.get("aiMessageLimitOverride") ?? "",
            ),
        });

        await setSaasUserAiLimitOverride(
            parsed.userId,
            parsed.aiMessageLimitOverride,
        );
        revalidatePath("/admin/tenants");
    } catch {
        return;
    }
}
