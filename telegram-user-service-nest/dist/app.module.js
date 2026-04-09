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
const config_1 = require("@nestjs/config");
const schedule_module_1 = require("./schedule/schedule.module");
const telegram_module_1 = require("./telegram/telegram.module");
const syncpay_module_1 = require("./syncpay/syncpay.module");
const template_module_1 = require("./template/template.module");
const bullmq_1 = require("@nestjs/bullmq");
const nestjs_1 = require("@bull-board/nestjs");
const express_1 = require("@bull-board/express");
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const constants_1 = require("./telegram/constants");
const whatsapp_queue_constants_1 = require("./whatsapp/queue/constants/whatsapp-queue.constants");
const whatsapp_module_1 = require("./whatsapp/whatsapp.module");
const ai_agent_module_1 = require("./modules/ai-agent/ai-agent.module");
const ai_agent_service_1 = require("./modules/ai-agent/ai-agent.service");
const subscription_module_1 = require("./modules/subscription/subscription.module");
const billing_module_1 = require("./modules/billing/billing.module");
const delivery_module_1 = require("./modules/delivery/delivery.module");
const admin_module_1 = require("./modules/admin/admin.module");
const orders_module_1 = require("./modules/orders/orders.module");
const evolution_module_1 = require("./modules/evolution/evolution.module");
const operating_hours_module_1 = require("./modules/operating-hours/operating-hours.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.forRoot({
                connection: {
                    host: process.env.REDIS_HOST ?? "localhost",
                    port: Number(process.env.REDIS_PORT ?? 6379),
                },
            }),
            nestjs_1.BullBoardModule.forRoot({
                route: "/admin/queues",
                adapter: express_1.ExpressAdapter,
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: constants_1.QUEUE_NAME,
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: constants_1.TRANSFER_QUEUE_NAME,
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: ai_agent_service_1.AI_RESPONSE_QUEUE_NAME,
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: whatsapp_queue_constants_1.WHATSAPP_INCOMING_QUEUE_NAME,
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: whatsapp_queue_constants_1.WHATSAPP_OUTGOING_QUEUE_NAME,
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
            nestjs_1.BullBoardModule.forFeature({
                name: whatsapp_queue_constants_1.WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME,
                adapter: bullMQAdapter_1.BullMQAdapter,
            }),
            config_1.ConfigModule.forRoot({
                envFilePath: [".env.local", ".env"],
                isGlobal: true,
            }),
            schedule_module_1.ScheduleModule,
            telegram_module_1.TelegramModule,
            ai_agent_module_1.AiAgentModule,
            subscription_module_1.SubscriptionModule,
            billing_module_1.BillingModule,
            delivery_module_1.DeliveryModule,
            orders_module_1.OrdersModule,
            admin_module_1.AdminModule,
            evolution_module_1.EvolutionModule,
            operating_hours_module_1.OperatingHoursModule,
            syncpay_module_1.SyncPayModule,
            template_module_1.TemplateModule,
            whatsapp_module_1.WhatsappModule,
        ],
        controllers: [],
        providers: [],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map