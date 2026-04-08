import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SubscriptionModule } from "../subscription/subscription.module";
import { AdminMonitoringService } from "./admin-monitoring.service";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";

@Module({
    imports: [PrismaModule, SubscriptionModule],
    providers: [AdminService, AdminMonitoringService],
    controllers: [AdminController],
    exports: [AdminService],
})
export class AdminModule {}
