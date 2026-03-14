import { ScheduleService } from "./schedule.service";
export declare class ScheduleController {
    private readonly scheduleService;
    constructor(scheduleService: ScheduleService);
    process(secret: string): Promise<{
        processed: number;
        failed: number;
        fired: number;
        errors: number;
        success: boolean;
    }>;
}
