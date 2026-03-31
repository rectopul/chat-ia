"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const syncpay_module_1 = require("../syncpay/syncpay.module");
const mtproto_provider_1 = require("./providers/mtproto.provider");
const bot_api_provider_1 = require("./providers/bot-api.provider");
const runtime_registry_provider_1 = require("./providers/runtime-registry.provider");
const media_service_1 = require("./services/media.service");
const session_service_1 = require("./services/session.service");
const template_service_1 = require("./services/template.service");
const scheduler_service_1 = require("./services/scheduler.service");
const business_bot_service_1 = require("./services/business-bot.service");
const telegram_service_1 = require("./services/telegram.service");
const bullmq_1 = require("@nestjs/bullmq");
const telegram_controller_1 = require("./telegram.controller");
const constants_1 = require("./constants");
const message_processor_1 = require("./processors/message.processor");
const group_scraper_service_1 = require("./services/group-scraper.service");
const transfer_processor_1 = require("./processors/transfer.processor");
const scraper_controller_1 = require("./controllers/scraper.controller");
const chat_action_service_1 = require("./services/chat-action.service");
let TelegramModule = class TelegramModule {
};
exports.TelegramModule = TelegramModule;
exports.TelegramModule = TelegramModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({
                name: constants_1.QUEUE_NAME,
            }),
            bullmq_1.BullModule.registerQueue({
                name: constants_1.TRANSFER_QUEUE_NAME,
            }),
            prisma_module_1.PrismaModule,
            syncpay_module_1.SyncPayModule,
        ],
        providers: [
            mtproto_provider_1.MtprotoProvider,
            bot_api_provider_1.BotApiProvider,
            runtime_registry_provider_1.RuntimeRegistryProvider,
            chat_action_service_1.ChatActionService,
            media_service_1.MediaService,
            session_service_1.SessionService,
            template_service_1.TemplateService,
            scheduler_service_1.SchedulerService,
            business_bot_service_1.BusinessBotService,
            group_scraper_service_1.GroupScraperService,
            telegram_service_1.TelegramService,
            message_processor_1.MessageProcessor,
            transfer_processor_1.TransferProcessor,
        ],
        exports: [telegram_service_1.TelegramService, scheduler_service_1.SchedulerService],
        controllers: [telegram_controller_1.TelegramController, scraper_controller_1.ScraperController],
    })
], TelegramModule);
//# sourceMappingURL=telegram.module.js.map