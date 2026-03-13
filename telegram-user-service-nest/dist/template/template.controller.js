"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateController = void 0;
const common_1 = require("@nestjs/common");
const template_service_1 = require("./template.service");
let TemplateController = class TemplateController {
    constructor(templateService) {
        this.templateService = templateService;
    }
    async send(body) {
        await this.templateService.sendTemplate(body.botId, body.chatId, body.templateId);
        return { success: true };
    }
    async schedule(body) {
        const count = await this.templateService.scheduleCampaignsForUser(body.botId, body.telegramUserId, body.chatId, body.segment);
        return { success: true, jobsCreated: count };
    }
    async processJobs(secret) {
        const expected = process.env.CRON_SECRET;
        if (expected && secret !== expected) {
            throw new common_1.UnauthorizedException("Invalid cron secret.");
        }
        const result = await this.templateService.processScheduledJobs();
        return { success: true, ...result };
    }
};
exports.TemplateController = TemplateController;
__decorate([
    (0, common_1.Post)("send"),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TemplateController.prototype, "send", null);
__decorate([
    (0, common_1.Post)("schedule"),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TemplateController.prototype, "schedule", null);
__decorate([
    (0, common_1.Post)("process-jobs"),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Headers)("x-cron-secret")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TemplateController.prototype, "processJobs", null);
exports.TemplateController = TemplateController = __decorate([
    (0, common_1.Controller)("templates"),
    __metadata("design:paramtypes", [template_service_1.TemplateService])
], TemplateController);
//# sourceMappingURL=template.controller.js.map