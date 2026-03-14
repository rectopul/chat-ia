// schedule/schedule.controller.ts
import {
    Controller,
    Post,
    HttpCode,
    Headers,
    UnauthorizedException,
} from "@nestjs/common";
import { ScheduleService } from "./schedule.service";

@Controller("schedules")
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) {}

    /**
     * Processa os RecurringSchedules do momento atual.
     * Deve ser chamado a cada minuto pelo Vercel Cron (ou qualquer scheduler externo).
     *
     * POST /schedules/process
     * Header: x-cron-secret: <CRON_SECRET>
     */
    @Post("process")
    @HttpCode(200)
    async process(@Headers("x-cron-secret") secret: string) {
        const expected = process.env.CRON_SECRET;
        if (expected && secret !== expected) {
            throw new UnauthorizedException("Invalid cron secret.");
        }
        const donntsells = await this.scheduleService.processJobs();
        const result = await this.scheduleService.processRecurringSchedules();
        return { success: true, ...result, ...donntsells };
    }
}
