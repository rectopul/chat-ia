export function formatTokenCount(value: number) {
    return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatAverageTokens(value: number) {
    return `${new Intl.NumberFormat("pt-BR").format(value)} tok/request`;
}

export function formatDateTime(value: Date | null) {
    if (!value) {
        return "Sem registro";
    }

    return value.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}
