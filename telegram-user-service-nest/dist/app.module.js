"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const telegram_controller_1 = require("./telegram/telegram.controller");
const telegram_service_1 = require("./telegram/telegram.service");
const prisma_service_1 = require("./prisma/prisma.service");
const config_1 = require("@nestjs/config");
const template_controller_1 = require("./template/template.controller");
const template_service_1 = require("./template/template.service");
const schedule_module_1 = require("./schedule/schedule.module");
const telegram_module_1 = require("./telegram/telegram.module");
const syncpay_module_1 = require("./syncpay/syncpay.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                envFilePath: [".env.local", ".env"],
                isGlobal: true,
            }),
            schedule_module_1.ScheduleModule,
            telegram_module_1.TelegramModule,
            syncpay_module_1.SyncPayModule,
        ],
        controllers: [telegram_controller_1.TelegramController, template_controller_1.TemplateController],
        providers: [telegram_service_1.TelegramService, prisma_service_1.PrismaService, template_service_1.TemplateService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map