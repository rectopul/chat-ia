export const DEFAULT_OPERATING_TIMEZONE = "America/Sao_Paulo";
export const DEFAULT_OPEN_TIME = "08:00";
export const DEFAULT_CLOSE_TIME = "18:00";

export const WEEKDAY_OPTIONS = [
    { dayOfWeek: 0, label: "Domingo" },
    { dayOfWeek: 1, label: "Segunda" },
    { dayOfWeek: 2, label: "Terca" },
    { dayOfWeek: 3, label: "Quarta" },
    { dayOfWeek: 4, label: "Quinta" },
    { dayOfWeek: 5, label: "Sexta" },
    { dayOfWeek: 6, label: "Sabado" },
] as const;

export type OperatingHourFormRow = {
    dayOfWeek: number;
    label: string;
    openTime: string;
    closeTime: string;
    isOpen: boolean;
};
