import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionGuard } from "./subscription.guard";
import { AdminRoleGuard } from "./admin-role.guard";

@Module({
    imports: [PrismaModule],
    providers: [SubscriptionService, SubscriptionGuard, AdminRoleGuard],
    exports: [SubscriptionService, SubscriptionGuard, AdminRoleGuard],
})
export class SubscriptionModule {}
