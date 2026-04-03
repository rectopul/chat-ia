import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Post,
    UnauthorizedException,
} from "@nestjs/common";
import { PlanType } from "@prisma/client";
import { BillingService } from "./billing.service";

@Controller()
export class BillingController {
    constructor(private readonly billingService: BillingService) {}

    @Get("billing/plans")
    getPlans() {
        return this.billingService.getPlans();
    }

    @Post("billing/activate-free")
    async activateFree(@Headers("x-user-id") userId?: string) {
        if (!userId) {
            throw new UnauthorizedException("x-user-id header is required");
        }

        return this.billingService.activateFreePlan(userId);
    }

    @Post("billing/checkout")
    async createCheckout(
        @Headers("x-user-id") userId: string | undefined,
        @Body() body: { planType: PlanType },
    ) {
        if (!userId) {
            throw new UnauthorizedException("x-user-id header is required");
        }

        return this.billingService.createCheckout(userId, body.planType);
    }

    @Post("api/syncpay/webhook")
    @HttpCode(200)
    async handleSyncPayWebhook(@Body() payload: unknown) {
        await this.billingService.handleWebhook(payload);
        return { ok: true };
    }
}
