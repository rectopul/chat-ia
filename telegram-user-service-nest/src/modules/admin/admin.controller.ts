import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Query,
    UseGuards,
} from "@nestjs/common";
import { SubscriptionStatus, UserAccessStatus } from "@prisma/client";
import { AdminRoleGuard } from "../subscription/admin-role.guard";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AdminRoleGuard)
export class AdminController {
    constructor(private readonly adminService: AdminService) {}

    @Get("dashboard")
    getDashboard() {
        return this.adminService.getDashboardMetrics();
    }

    @Get("users")
    listUsers(
        @Query("accessStatus") accessStatus?: UserAccessStatus,
        @Query("subscriptionStatus") subscriptionStatus?: SubscriptionStatus,
    ) {
        return this.adminService.listUsers({
            accessStatus:
                accessStatus && Object.values(UserAccessStatus).includes(accessStatus)
                    ? accessStatus
                    : undefined,
            subscriptionStatus:
                subscriptionStatus &&
                Object.values(SubscriptionStatus).includes(subscriptionStatus)
                    ? subscriptionStatus
                    : undefined,
        });
    }

    @Patch("users/:userId/access")
    updateAccess(
        @Param("userId") userId: string,
        @Body() body: { accessStatus: UserAccessStatus },
    ) {
        return this.adminService.setUserAccessStatus(
            userId,
            body.accessStatus,
        );
    }

    @Get("balance")
    async getBalance(@Query("period") period?: "daily" | "monthly") {
        return this.adminService.getBalance(period === "daily" ? "daily" : "monthly");
    }
}
