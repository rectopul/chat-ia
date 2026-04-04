export function normalizePhoneNumber(input: string): string {
    const trimmed = input.trim();

    if (!trimmed) {
        return "";
    }

    const hasPlus = trimmed.startsWith("+");
    const digits = trimmed.replace(/\D/g, "");

    if (!digits) {
        return "";
    }

    return hasPlus ? `+${digits}` : digits;
}

export function getPhoneNumberVariants(input: string): string[] {
    const normalized = normalizePhoneNumber(input);

    if (!normalized) {
        return [];
    }

    const digits = normalized.replace(/\D/g, "");
    const variants = new Set<string>([normalized, digits, `+${digits}`]);

    return Array.from(variants).filter(Boolean);
}
