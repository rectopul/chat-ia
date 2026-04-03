"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { MessageTemplateKey, MediaType } from "@prisma/client";
import { requireSessionUser } from "@/lib/server-session";

type TemplateInput = {
    key: string;
    title: string;
    type: string;
    text?: string;
    mediaUrl?: string;
    tags?: string[];
    comboItems?: { type: string; url: string; tags?: string[] }[];
};

export async function createUserTemplateAction(data: TemplateInput) {
    const user = await requireSessionUser();

    const template = await prisma.messageTemplate.create({
        data: {
            ownerUserId: user.id,
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

    revalidatePath("/dashboard/messages");
}

export async function deleteUserTemplateAction(templateId: string) {
    const user = await requireSessionUser();

    await prisma.messageTemplate.deleteMany({
        where: {
            id: templateId,
            ownerUserId: user.id,
        },
    });

    revalidatePath("/dashboard/messages");
}

export async function toggleUserTemplateAction(
    templateId: string,
    current: boolean,
) {
    const user = await requireSessionUser();

    await prisma.messageTemplate.updateMany({
        where: {
            id: templateId,
            ownerUserId: user.id,
        },
        data: { isActive: !current },
    });

    revalidatePath("/dashboard/messages");
}
