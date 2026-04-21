import {
    BusinessProfile,
    DeliveryType,
    PaymentMethod,
} from "@prisma/client";

export const BUSINESS_PROFILE_OPTIONS: Array<{
    value: BusinessProfile;
    label: string;
    description: string;
}> = [
    {
        value: BusinessProfile.GROCERY,
        label: "Mercearia",
        description: "Foco em estoque, unidades e reposicao rapida.",
    },
    {
        value: BusinessProfile.RESTAURANT,
        label: "Restaurante",
        description: "Foco em marmitas, pratos e combinacoes do cardapio.",
    },
    {
        value: BusinessProfile.SNACK_BAR,
        label: "Lanchonete",
        description: "Foco em combos, adicionais e montagem agil.",
    },
    {
        value: BusinessProfile.EVENT,
        label: "Eventos",
        description: "Foco em briefing, convidados e pedido de orcamento.",
    },
];

export const PAYMENT_METHOD_OPTIONS: Array<{
    value: PaymentMethod;
    label: string;
    description: string;
}> = [
    {
        value: PaymentMethod.PIX_ONLINE,
        label: "Pix online",
        description: "Copia e cola na hora para pagamento imediato.",
    },
    {
        value: PaymentMethod.PIX_DELIVERY,
        label: "Pix na entrega",
        description: "O cliente paga via Pix no momento da entrega.",
    },
    {
        value: PaymentMethod.CARD_DELIVERY,
        label: "Cartao na entrega",
        description: "Pagamento na maquininha com o entregador.",
    },
    {
        value: PaymentMethod.CASH,
        label: "Dinheiro",
        description: "Recebimento em dinheiro com opcao de troco.",
    },
];

export const DELIVERY_TYPE_OPTIONS: Array<{
    value: DeliveryType;
    label: string;
    description: string;
}> = [
    {
        value: DeliveryType.DELIVERY,
        label: "Entrega",
        description: "Pedido vai ate o cliente com taxa e checkout de delivery.",
    },
    {
        value: DeliveryType.PICKUP,
        label: "Retirada",
        description: "Cliente retira no local e pode pagar na retirada.",
    },
];

export function getBusinessProfileLabel(profile: BusinessProfile) {
    return (
        BUSINESS_PROFILE_OPTIONS.find((option) => option.value === profile)
            ?.label ?? "Mercearia"
    );
}

export function getPaymentMethodLabel(paymentMethod: PaymentMethod) {
    return (
        PAYMENT_METHOD_OPTIONS.find(
            (option) => option.value === paymentMethod,
        )?.label ?? paymentMethod
    );
}

export function getDeliveryTypeLabel(deliveryType: DeliveryType) {
    return (
        DELIVERY_TYPE_OPTIONS.find((option) => option.value === deliveryType)
            ?.label ?? deliveryType
    );
}
