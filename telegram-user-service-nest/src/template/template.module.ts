// template/template.module.ts
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TelegramModule } from "../telegram/telegram.module";
import { TemplateController } from "./template.controller";
import { TemplateService } from "./template.service";

@Module({
    imports: [PrismaModule, TelegramModule],
    controllers: [TemplateController],
    providers: [TemplateService],
    exports: [TemplateService],
})
export class TemplateModule {}
