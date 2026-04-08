import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    Param,
    Patch,
    Query,
    UseGuards,
} from "@nestjs/common";
import { PlanType, SubscriptionStatus, UserAccessStatus } from "@prisma/client";
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

    @Get("monitoring/messages")
    getProcessedMessages(
        @Query("planType") planType?: PlanType,
        @Query("from") from?: string,
        @Query("to") to?: string,
    ) {
        return this.adminService.getProcessedMessagesByDay({
            planType: this.parsePlanType(planType),
            from: this.parseDate(from, "from"),
            to: this.parseDate(to, "to"),
        });
    }

    @Get("monitoring/instances/health")
    getInstanceHealth() {
        return this.adminService.getInstanceHealth();
    }

    @Get("monitoring/financial")
    getFinancialMonitoring(
        @Query("period") period?: "daily" | "monthly",
        @Query("planType") planType?: PlanType,
        @Query("from") from?: string,
        @Query("to") to?: string,
    ) {
        return this.adminService.getFinancialMonitoring({
            period: period === "daily" ? "daily" : "monthly",
            planType: this.parsePlanType(planType),
            from: this.parseDate(from, "from"),
            to: this.parseDate(to, "to"),
        });
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
    async getBalance(
        @Query("period") period?: "daily" | "monthly",
        @Query("planType") planType?: PlanType,
        @Query("from") from?: string,
        @Query("to") to?: string,
    ) {
        return this.adminService.getBalance(
            period === "daily" ? "daily" : "monthly",
            this.parsePlanType(planType),
            this.parseDate(from, "from"),
            this.parseDate(to, "to"),
        );
    }

    @Get("openapi.json")
    getOpenApiDocument() {
        return this.adminService.getOpenApiDocument();
    }

    @Get("docs")
    @Header("Content-Type", "text/html; charset=utf-8")
    getSwaggerPage() {
        return this.adminService.getSwaggerHtml("/admin/openapi.json");
    }

    private parsePlanType(planType?: PlanType): PlanType | undefined {
        if (!planType) {
            return undefined;
        }

        if (!Object.values(PlanType).includes(planType)) {
            throw new BadRequestException(`Invalid planType: ${planType}`);
        }

        return planType;
    }

    private parseDate(value: string | undefined, label: string): Date | undefined {
        if (!value) {
            return undefined;
        }

        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) {
            throw new BadRequestException(`Invalid ${label} date: ${value}`);
        }

        return parsed;
    }
}
