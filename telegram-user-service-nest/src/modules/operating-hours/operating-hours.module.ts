import { Module } from "@nestjs/common";
import { OperatingHoursService } from "./operating-hours.service";

@Module({
    providers: [OperatingHoursService],
    exports: [OperatingHoursService],
})
export class OperatingHoursModule {}
