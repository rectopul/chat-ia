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
exports.TelegramController = void 0;
const common_1 = require("@nestjs/common");
const telegram_service_1 = require("./telegram.service");
let TelegramController = class TelegramController {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }
    async send(body) {
        const { botId, chatId, template, secret } = body;
        if (secret !== process.env.TELEGRAM_SERVICE_SECRET) {
            throw new common_1.ForbiddenException("Invalid secret");
        }
        await this.telegramService.sendTemplate(botId, chatId, template);
        return { ok: true };
    }
    async sendCode(body) {
        const { botId, phoneNumber } = body;
        if (!phoneNumber) {
            throw new common_1.ForbiddenException("Invalid Phone number");
        }
        await this.telegramService.sendCode(botId, phoneNumber);
        return { ok: true };
    }
    async verifyCode(body) {
        const { botId, phoneNumber, code } = body;
        if (!phoneNumber) {
            throw new common_1.ForbiddenException("Invalid Phone number");
        }
        return await this.telegramService.verifyCode(botId, phoneNumber, code);
    }
    verifyPassword(body) {
        return this.telegramService.verifyPassword(body.botId, body.password);
    }
    async registerBusinessBot(body) {
        await this.telegramService.initBusinessBot(body.botId, body.token);
        return { message: "Business bot inicializado com sucesso." };
    }
    async getBotStatus() {
        return this.telegramService.getBotStatus();
    }
    async confirmPayment(body) {
        return this.telegramService.confirmPayment(body.saleId);
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Post)("send"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "send", null);
__decorate([
    (0, common_1.Post)("send-code"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendCode", null);
__decorate([
    (0, common_1.Post)("verify-code"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "verifyCode", null);
__decorate([
    (0, common_1.Post)("verify-password"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "verifyPassword", null);
__decorate([
    (0, common_1.Post)("register-business-bot"),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "registerBusinessBot", null);
__decorate([
    (0, common_1.Get)("bot-status"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getBotStatus", null);
__decorate([
    (0, common_1.Post)("confirm-payment"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "confirmPayment", null);
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)("telegram"),
    __metadata("design:paramtypes", [telegram_service_1.TelegramService])
], TelegramController);
//# sourceMappingURL=telegram.controller.js.map