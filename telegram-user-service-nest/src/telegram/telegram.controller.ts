import {
    Controller,
    Post,
    Body,
    ForbiddenException,
    HttpCode,
    Get,
} from "@nestjs/common";
import { TelegramService } from "./services/telegram.service";
import { BotStatusResponse } from "./interfaces";

@Controller("telegram")
export class TelegramController {
    constructor(private readonly telegramService: TelegramService) {}

    @Post("send")
    async send(@Body() body: any) {
        const { botId, chatId, template, secret } = body;

        if (secret !== process.env.TELEGRAM_SERVICE_SECRET) {
            throw new ForbiddenException("Invalid secret");
        }

        await this.telegramService.sendTemplate(botId, chatId, template);
        return { ok: true };
    }

    @Post("send-code")
    async sendCode(@Body() body: any) {
        const { botId, phoneNumber } = body;

        if (!phoneNumber) {
            throw new ForbiddenException("Invalid Phone number");
        }

        await this.telegramService.sendCode(botId, phoneNumber);
        return { ok: true };
    }

    @Post("verify-code")
    async verifyCode(@Body() body: any) {
        const { botId, phoneNumber, code } = body;

        if (!phoneNumber) {
            throw new ForbiddenException("Invalid Phone number");
        }

        return await this.telegramService.verifyCode(botId, phoneNumber, code);
    }

    /**
     * PASSO 3 (só se requires2FA): Valida a senha 2FA.
     * Resposta: { success: true, session }
     */
    @Post("verify-password")
    verifyPassword(@Body() body: { botId: string; password: string }) {
        return this.telegramService.verifyPassword(body.botId, body.password);
    }

    /**
     * Chamado pelo frontend ao salvar um novo Business Bot token.
     * Inicializa o bot em tempo real sem precisar reiniciar o servidor.
     */
    @Post("register-business-bot")
    @HttpCode(200)
    async registerBusinessBot(@Body() body: { botId: string; token: string }) {
        await this.telegramService.initBusinessBot(body.botId, body.token);
        return { message: "Business bot inicializado com sucesso." };
    }

    @Post("create-sale-checkout")
    @HttpCode(200)
    async createSaleCheckout(
        @Body()
        body: {
            botId: string;
            telegramUserId: string;
            productId: string;
            discountPercent?: number;
        },
    ) {
        return this.telegramService.createSaleCheckout(body);
    }

    @Get("bot-status")
    async getBotStatus(): Promise<BotStatusResponse> {
        return this.telegramService.getBotStatus();
    }

    @Post("confirm-payment")
    async confirmPayment(@Body() body: { saleId: string }): Promise<any> {
        return this.telegramService.confirmPayment(body.saleId);
    }
}
