export function normalizePhoneDigits(value: string) {
    return value.replace(/\D/g, "");
}

export function formatPhoneMask(value: string) {
    const digits = normalizePhoneDigits(value).slice(0, 11);

    if (digits.length <= 2) {
        return digits ? `(${digits}` : "";
    }

    if (digits.length <= 6) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    }

    if (digits.length <= 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
