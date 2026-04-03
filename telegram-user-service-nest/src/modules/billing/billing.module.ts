import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SyncPayModule } from "../../syncpay/syncpay.module";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";

@Module({
    imports: [PrismaModule, SyncPayModule],
    providers: [BillingService],
    controllers: [BillingController],
    exports: [BillingService],
})
export class BillingModule {}
