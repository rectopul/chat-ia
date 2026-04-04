"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { MessageTemplateKey, MediaType } from "@prisma/client";
import { requireSuperAdminUser } from "@/lib/server-session";

type TemplateInput = {
    key: string;
    title: string;
    type: string;
    text?: string;
    mediaUrl?: string;
    tags?: string[];
    comboItems?: { type: string; url: string; tags?: string[] }[];
};

export async function createAdminTemplateAction(data: TemplateInput) {
    await requireSuperAdminUser();

    const template = await prisma.messageTemplate.create({
        data: {
            key: data.key as MessageTemplateKey,
            title: data.title,
            type: data.type as MediaType,
            text: data.text || null,
            mediaUrl: data.mediaUrl || null,
            tags: data.tags ?? [],
        },
    });

    if (data.type === "COMBO" && data.comboItems?.length) {
        await prisma.messageTemplateMedia.createMany({
            data: data.comboItems.map((item, index) => ({
                templateId: template.id,
                type: item.type as MediaType,
                url: item.url,
                order: index,
                tags: item.tags ?? [],
            })),
        });
    }

    revalidatePath("/admin/messages");
}

export async function deleteAdminTemplateAction(templateId: string) {
    await requireSuperAdminUser();
    await prisma.messageTemplate.delete({ where: { id: templateId } });
    revalidatePath("/admin/messages");
}

export async function toggleAdminTemplateAction(
    templateId: string,
    current: boolean,
) {
    await requireSuperAdminUser();
    await prisma.messageTemplate.update({
        where: { id: templateId },
        data: { isActive: !current },
    });
    revalidatePath("/admin/messages");
}
