import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { EvolutionWebhookService } from "../../application/webhooks/evolution-webhook.service";

@Controller("webhooks")
export class EvolutionWebhookController {
    constructor(
        private readonly evolutionWebhookService: EvolutionWebhookService,
    ) {}

    @Post("evolution")
    @HttpCode(200)
    async handleEvolutionWebhook(@Body() payload: unknown) {
        await this.evolutionWebhookService.handleWebhook(payload);
        return { ok: true };
    }
}
