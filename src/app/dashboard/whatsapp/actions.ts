"use server";

import { revalidatePath } from "next/cache";
import {
    BusinessProfile,
    DeliveryType,
    PaymentMethod,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/server-session";
import {
    DEFAULT_CLOSE_TIME,
    DEFAULT_OPEN_TIME,
    DEFAULT_OPERATING_TIMEZONE,
    WEEKDAY_OPTIONS,
} from "./operating-hours";

export async function createWhatsappInstanceAction(formData: FormData) {
    const user = await requireSessionUser();
    const instanceName = String(formData.get("instanceName") ?? "").trim();
    const status =
        String(formData.get("status") ?? "DISCONNECTED").trim() ||
        "DISCONNECTED";

    if (!instanceName) {
        return;
    }

    await prisma.whatsappInstance.create({
        data: {
            userId: user.id,
            instanceName,
            status,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

export async function updateWhatsappInstanceAction(formData: FormData) {
    const user = await requireSessionUser();
    const id = String(formData.get("id") ?? "").trim();
    const instanceName = String(formData.get("instanceName") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!id || !instanceName || !status) {
        return;
    }

    await prisma.whatsappInstance.updateMany({
        where: {
            id,
            userId: user.id,
        },
        data: {
            instanceName,
            status,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

export async function deleteWhatsappInstanceAction(formData: FormData) {
    const user = await requireSessionUser();
    const id = String(formData.get("id") ?? "").trim();

    if (!id) {
        return;
    }

    await prisma.whatsappInstance.deleteMany({
        where: {
            id,
            userId: user.id,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

export async function updateWhatsappClosedMessageAction(formData: FormData) {
    const user = await requireSessionUser();
    const closedMessage = String(formData.get("closedMessage") ?? "").trim();

    await prisma.user.update({
        where: {
            id: user.id,
        },
        data: {
            closedMessage: closedMessage || null,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

export async function updateManualStoreClosedAction(formData: FormData) {
    const user = await requireSessionUser();
    const manualStoreClosed = String(
        formData.get("manualStoreClosed") ?? "",
    ).trim() === "1";

    await prisma.user.update({
        where: {
            id: user.id,
        },
        data: {
            manualStoreClosed,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

function parseMoneyInputToCents(value: FormDataEntryValue | null) {
    const rawValue = String(value ?? "").trim();

    if (!rawValue) {
        return 0;
    }

    const sanitizedValue = rawValue.replace(/[^\d,.-]/g, "");
    const normalizedValue = sanitizedValue.includes(",")
        ? sanitizedValue.replace(/\./g, "").replace(",", ".")
        : sanitizedValue;
    const parsedValue = Number(normalizedValue);

    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        throw new Error("Informe um valor valido para a taxa de entrega.");
    }

    return Math.round(parsedValue * 100);
}

export async function updateDeliveryFeeAction(formData: FormData) {
    const user = await requireSessionUser();
    const deliveryFeeCents = parseMoneyInputToCents(
        formData.get("deliveryFee"),
    );

    await prisma.user.update({
        where: {
            id: user.id,
        },
        data: {
            deliveryFeeCents,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard");
}

function parseEnumListValue<T extends string>(
    values: FormDataEntryValue[],
    allowedValues: readonly T[],
    errorMessage: string,
) {
    const normalizedValues = values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean) as T[];

    if (!normalizedValues.length) {
        throw new Error(errorMessage);
    }

    const uniqueValues = [...new Set(normalizedValues)];

    if (!uniqueValues.every((value) => allowedValues.includes(value))) {
        throw new Error(errorMessage);
    }

    return uniqueValues;
}

export async function updateAssistantProfileAction(formData: FormData) {
    const user = await requireSessionUser();
    const assistantName = String(formData.get("assistantName") ?? "").trim();
    const businessProfile = String(
        formData.get("businessProfile") ?? "",
    ).trim() as BusinessProfile;

    if (!Object.values(BusinessProfile).includes(businessProfile)) {
        throw new Error("Selecione um perfil de negocio valido.");
    }

    if (assistantName.length > 80) {
        throw new Error("O nome do atendente deve ter ate 80 caracteres.");
    }

    await prisma.user.update({
        where: {
            id: user.id,
        },
        data: {
            assistantName: assistantName || null,
            businessProfile,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}

export async function updateStoreCheckoutSettingsAction(formData: FormData) {
    const user = await requireSessionUser();
    const storeAddress = String(formData.get("storeAddress") ?? "").trim();
    const deliveryFeeCents = parseMoneyInputToCents(
        formData.get("deliveryFee"),
    );
    const acceptedPaymentMethods = parseEnumListValue(
        formData.getAll("acceptedPaymentMethods"),
        Object.values(PaymentMethod),
        "Selecione pelo menos um metodo de pagamento aceito.",
    );
    const availableDeliveryTypes = parseEnumListValue(
        formData.getAll("availableDeliveryTypes"),
        Object.values(DeliveryType),
        "Selecione pelo menos uma modalidade de atendimento.",
    );

    if (storeAddress.length < 8) {
        throw new Error(
            "Informe um endereco valido para a loja com rua, numero e referencia basica.",
        );
    }

    if (storeAddress.length > 220) {
        throw new Error("O endereco da loja deve ter ate 220 caracteres.");
    }

    await prisma.user.update({
        where: {
            id: user.id,
        },
        data: {
            storeAddress,
            deliveryFeeCents,
            acceptedPaymentMethods,
            availableDeliveryTypes,
        },
    });

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard");
}

function normalizeTime(value: FormDataEntryValue | null, fallback: string) {
    const normalizedValue = String(value ?? "").trim();
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(normalizedValue)
        ? normalizedValue
        : fallback;
}

export async function updateOperatingHoursAction(formData: FormData) {
    const user = await requireSessionUser();
    const timezone =
        String(formData.get("timezone") ?? "").trim() ||
        DEFAULT_OPERATING_TIMEZONE;

    const operatingHours = WEEKDAY_OPTIONS.map(({ dayOfWeek }) => ({
        subscriberId: user.id,
        dayOfWeek,
        openTime: normalizeTime(
            formData.get(`openTime_${dayOfWeek}`),
            DEFAULT_OPEN_TIME,
        ),
        closeTime: normalizeTime(
            formData.get(`closeTime_${dayOfWeek}`),
            DEFAULT_CLOSE_TIME,
        ),
        isOpen: formData.has(`isOpen_${dayOfWeek}`),
        timezone,
    }));

    await prisma.$transaction([
        prisma.operatingHour.deleteMany({
            where: {
                subscriberId: user.id,
            },
        }),
        prisma.operatingHour.createMany({
            data: operatingHours,
        }),
    ]);

    revalidatePath("/dashboard/whatsapp");
    revalidatePath("/dashboard");
}
