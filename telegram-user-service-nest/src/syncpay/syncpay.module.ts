import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SyncPayService } from "./syncpay.service";

@Module({
    imports: [PrismaModule],
    providers: [SyncPayService],
    exports: [SyncPayService],
})
export class SyncPayModule {}
