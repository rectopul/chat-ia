import { Injectable } from "@nestjs/common";
import { OperatingHour } from "@prisma/client";
import { DateTime, IANAZone } from "luxon";
import { PrismaService } from "../../prisma/prisma.service";

type StoreOpenResult = {
    isOpen: boolean;
    message: string;
};

const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const DEFAULT_CLOSED_MESSAGE = "Estamos fechados no momento.";
const DEFAULT_OPEN_MESSAGE = "Estamos abertos no momento.";

@Injectable()
export class OperatingHoursService {
    constructor(private readonly prisma: PrismaService) {}

    async isStoreOpen(subscriberId: string): Promise<StoreOpenResult> {
        const normalizedSubscriberId = subscriberId.trim();

        if (!normalizedSubscriberId) {
            return {
                isOpen: true,
                message: DEFAULT_OPEN_MESSAGE,
            };
        }

        const subscriber = await this.prisma.user.findUnique({
            where: { id: normalizedSubscriberId },
            select: {
                closedMessage: true,
                manualStoreClosed: true,
                operatingHours: {
                    select: {
                        dayOfWeek: true,
                        openTime: true,
                        closeTime: true,
                        isOpen: true,
                        timezone: true,
                    },
                    orderBy: {
                        dayOfWeek: "asc",
                    },
                },
            },
        });

        const closedMessage =
            subscriber?.closedMessage?.trim() || DEFAULT_CLOSED_MESSAGE;
        const operatingHours = subscriber?.operatingHours ?? [];

        if (subscriber?.manualStoreClosed) {
            return {
                isOpen: false,
                message: closedMessage,
            };
        }

        if (!operatingHours.length) {
            return {
                isOpen: true,
                message: DEFAULT_OPEN_MESSAGE,
            };
        }

        const timezone = this.resolveTimezone(
            operatingHours.find((item) => item.timezone?.trim())?.timezone,
        );
        const now = DateTime.now().setZone(timezone);
        const currentDayOfWeek = this.mapDayOfWeek(now.weekday);
        const previousDayOfWeek = (currentDayOfWeek + 6) % 7;
        const currentMinutes = now.hour * 60 + now.minute;

        const todayHours = operatingHours.find(
            (item) => item.dayOfWeek === currentDayOfWeek,
        );
        const previousDayHours = operatingHours.find(
            (item) => item.dayOfWeek === previousDayOfWeek,
        );

        if (this.isWithinPreviousDayOvernightWindow(previousDayHours, currentMinutes)) {
            return {
                isOpen: true,
                message: DEFAULT_OPEN_MESSAGE,
            };
        }

        if (this.isWithinTodayWindow(todayHours, currentMinutes)) {
            return {
                isOpen: true,
                message: DEFAULT_OPEN_MESSAGE,
            };
        }

        return {
            isOpen: false,
            message: closedMessage,
        };
    }

    private isWithinTodayWindow(
        operatingHour: Pick<
            OperatingHour,
            "openTime" | "closeTime" | "isOpen" | "dayOfWeek" | "timezone"
        > | null | undefined,
        currentMinutes: number,
    ): boolean {
        if (!operatingHour?.isOpen) {
            return false;
        }

        const openMinutes = this.parseTimeToMinutes(operatingHour.openTime);
        const closeMinutes = this.parseTimeToMinutes(operatingHour.closeTime);

        if (openMinutes === null || closeMinutes === null) {
            return false;
        }

        if (openMinutes === closeMinutes) {
            return true;
        }

        if (openMinutes < closeMinutes) {
            return (
                currentMinutes >= openMinutes && currentMinutes < closeMinutes
            );
        }

        return currentMinutes >= openMinutes;
    }

    private isWithinPreviousDayOvernightWindow(
        operatingHour: Pick<
            OperatingHour,
            "openTime" | "closeTime" | "isOpen" | "dayOfWeek" | "timezone"
        > | null | undefined,
        currentMinutes: number,
    ): boolean {
        if (!operatingHour?.isOpen) {
            return false;
        }

        const openMinutes = this.parseTimeToMinutes(operatingHour.openTime);
        const closeMinutes = this.parseTimeToMinutes(operatingHour.closeTime);

        if (
            openMinutes === null ||
            closeMinutes === null ||
            openMinutes <= closeMinutes
        ) {
            return false;
        }

        return currentMinutes < closeMinutes;
    }

    private parseTimeToMinutes(value: string): number | null {
        const normalizedValue = value.trim();
        const match = normalizedValue.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

        if (!match) {
            return null;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        return hours * 60 + minutes;
    }

    private mapDayOfWeek(weekday: number): number {
        return weekday % 7;
    }

    private resolveTimezone(timezone?: string | null): string {
        const candidate = timezone?.trim() || DEFAULT_TIMEZONE;
        return IANAZone.isValidZone(candidate) ? candidate : DEFAULT_TIMEZONE;
    }
}
