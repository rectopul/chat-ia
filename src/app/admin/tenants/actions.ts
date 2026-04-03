"use server";

import { revalidatePath } from "next/cache";
import { UserAccessStatus } from "@prisma/client";
import { setSaasUserAccessStatus } from "@/lib/saas/server";
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
