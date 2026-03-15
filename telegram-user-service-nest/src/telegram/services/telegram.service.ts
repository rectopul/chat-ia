// src/telegram/services/telegram.service.ts
//
// Fachada principal — ponto único de entrada para controllers e outros módulos.
// Não contém lógica técnica: apenas delega aos sub-serviços e expõe a API pública.

import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MtprotoProvider } from "../providers/mtproto.provider";
import { BotApiProvider } from "../providers/bot-api.provider";
import { BusinessBotService } from "./business-bot.service";
import { SessionService } from "./session.service";
import { TemplateService } from "./template.service";
import { SchedulerService } from "./scheduler.service";
import { MessageTemplateKey } from "@prisma/client";
import { BusinessCtx, BotStatusResponse, BotStatusItem } from "../interfaces";

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TelegramService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mtproto: MtprotoProvider,
        private readonly botApi: BotApiProvider,
        private readonly businessBot: BusinessBotService,
        private readonly session: SessionService,
        private readonly templateService: TemplateService,
        private readonly scheduler: SchedulerService,
    ) {}

    // ── Lifecycle ─────────────────────────────────────────────────────────

    async onModuleInit(): Promise<void> {
        /**
         * IMPORTANTE: busca apenas contas isUserAccount=true.
         * O business bot é inicializado a partir do businessBotToken da MESMA conta,
         * garantindo que o botId seja consistente em todos os maps (causa raiz do BUSINESS_PEER_INVALID).
         */
        const accounts = await this.prisma.botAccount.findMany({
            where: {
                isUserAccount: true,
                session: { not: null },
                isActive: true,
            },
        });

        for (const account of accounts) {
            try {
                await this.mtproto.initClient(account);
                this.logger.log(`Client MTProto ${account.name} conectado.`);

                if (account.businessBotToken) {
                    await this.businessBot.initBusinessBot(
                        account.id,
                        account.businessBotToken,
                    );
                    this.logger.log(`Business bot ${account.name} conectado.`);
                }
            } catch (err) {
                this.logger.error(`Falha ao iniciar ${account.name}:`, err);
            }
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.mtproto.onModuleDestroy();
        await this.botApi.onModuleDestroy();
    }

    // ── Delegações ao BusinessBotService ─────────────────────────────────

    async initBusinessBot(botId: string, token: string): Promise<void> {
        return this.businessBot.initBusinessBot(botId, token);
    }

    // ── Delegações ao SessionService ──────────────────────────────────────

    async sendCode(botId: string, phoneNumber: string) {
        return this.session.sendCode(botId, phoneNumber);
    }

    async verifyCode(botId: string, phoneNumber: string, code: string) {
        return this.session.verifyCode(botId, phoneNumber, code);
    }

    async verifyPassword(botId: string, password: string) {
        return this.session.verifyPassword(botId, password);
    }

    // ── Delegações ao TemplateService ─────────────────────────────────────

    async sendTemplate(
        botId: string,
        chatId: string,
        template: any,
        businessCtx?: BusinessCtx,
    ) {
        return this.templateService.sendTemplate(
            botId,
            chatId,
            template,
            businessCtx,
        );
    }

    async sendDontSellMenu(
        botId: string,
        chatId: string | number,
        token: string,
        connectionId: string,
    ) {
        return this.templateService.sendDontSellMenu(
            botId,
            chatId,
            token,
            connectionId,
        );
    }

    // ── Delegações ao BotApiProvider ──────────────────────────────────────

    getBusinessBotToken(botId: string): string | undefined {
        return this.botApi.getToken(botId);
    }

    getBusinessConnectionId(
        botId: string,
        userTelegramId: string,
    ): string | undefined {
        return this.botApi.getOwnerConnectionId(botId, userTelegramId);
    }

    async resolveConnectionForChat(botId: string, chatId: string | number) {
        return this.botApi.resolveConnectionForChat(botId, chatId);
    }

    async sendBusinessMessageWithKeyboard(
        botId: string,
        businessConnectionId: string,
        recipientChatId: string | number,
        text: string,
        keyboard: string[][],
    ): Promise<void> {
        const token = this.botApi.getToken(botId);
        if (!token)
            throw new Error(`Token não encontrado para botId: ${botId}`);

        await this.botApi.sendMessageHttp(token, recipientChatId, text, {
            business_connection_id: businessConnectionId,
            reply_markup: {
                keyboard: keyboard.map((row) =>
                    row.map((label) => ({ text: label })),
                ),
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        });
    }

    async sendKeyboardAsBusinessUser(
        botId: string,
        ownerTelegramId: string,
        recipientChatId: string | number,
        text: string,
        keyboard: string[][],
    ): Promise<void> {
        const connectionId = this.botApi.getOwnerConnectionId(
            botId,
            ownerTelegramId,
        );
        if (!connectionId) {
            throw new Error(
                `Nenhuma business connection ativa para bot ${botId} / user ${ownerTelegramId}.`,
            );
        }
        await this.sendBusinessMessageWithKeyboard(
            botId,
            connectionId,
            recipientChatId,
            text,
            keyboard,
        );
    }

    // ── Confirm Payment ───────────────────────────────────────────────────

    async confirmPayment(saleId: string): Promise<void> {
        const sale = await this.prisma.sale.findUnique({
            where: { id: saleId },
            include: { product: true, user: true },
        });

        if (!sale) throw new Error(`Venda não encontrada: ${saleId}`);
        if (!sale.product.description) {
            throw new Error(
                `Produto "${sale.product.title}" não tem link/descrição configurado`,
            );
        }

        const token = this.botApi.getToken(sale.botId);
        if (!token)
            throw new Error(`Token não encontrado para botId: ${sale.botId}`);

        const businessConnectionId = await this.botApi.resolveConnectionForChat(
            sale.botId,
            sale.user.chatId,
        );
        if (!businessConnectionId) {
            throw new Error(
                `Business connection não encontrada para chatId: ${sale.user.chatId}`,
            );
        }

        const message = [
            `✅ Pagamento confirmado! Obrigado pela compra!`,
            ``,
            `🏷️ ${sale.product.title}`,
            ``,
            `📦 Seu acesso:`,
            sale.product.description,
            ``,
            `Qualquer dúvida é só chamar aqui. 💬`,
        ].join("\n");

        await this.botApi.sendMessageHttp(token, sale.user.chatId, message, {
            business_connection_id: businessConnectionId,
        });

        this.logger.log(
            `[confirmPayment] Enviado para chatId=${sale.user.chatId} (saleId=${saleId})`,
        );
    }

    // ── Bot Status Checklist ──────────────────────────────────────────────

    async getBotStatus(): Promise<BotStatusResponse> {
        const items: BotStatusItem[] = [];

        const botAccount = await this.prisma.botAccount.findFirst({
            where: {
                isUserAccount: true,
                isActive: true,
                session: { not: null },
            },
        });

        items.push({
            key: "bot_account",
            label: "Conta MTProto conectada",
            description:
                "Autentique uma conta em Configurações → Bot (API ID + API Hash + OTP).",
            ok: !!botAccount,
            critical: true,
        });

        items.push({
            key: "business_bot_token",
            label: "Token do Business Bot configurado",
            description:
                "Configure o token do @BotFather em Configurações → Bot.",
            ok: !!botAccount?.businessBotToken,
            critical: true,
        });

        items.push({
            key: "business_bot_running",
            label: "Business Bot ativo e conectado",
            description:
                "O bot não está rodando. Verifique o token e reinicie.",
            ok: botAccount ? this.botApi.hasBot(botAccount.id) : false,
            critical: true,
        });

        const businessConn = botAccount
            ? await this.prisma.businessConnection.findFirst({
                  where: { botId: botAccount.id, isEnabled: true },
              })
            : null;

        items.push({
            key: "business_connection",
            label: "Business Connection ativa",
            description:
                "Conecte o bot em: Telegram → Configurações → Telegram Business → Chatbots.",
            ok: !!businessConn,
            critical: true,
        });

        const welcomeTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.WELCOME },
        });

        items.push({
            key: "welcome_template",
            label: 'Template "WELCOME" cadastrado',
            description:
                'Crie um template com a chave "WELCOME" em Templates → Novo Template.',
            ok: !!welcomeTemplate,
            critical: true,
        });

        const productCount = await this.prisma.product.count({
            where: { isActive: true },
        });

        items.push({
            key: "active_product",
            label: "Pelo menos 1 produto ativo",
            description: "Cadastre um produto em Produtos → Novo Produto.",
            ok: productCount > 0,
            critical: true,
        });

        items.push({
            key: "syncpay",
            label: "Integração de pagamento (SyncPay) configurada",
            description:
                "Defina SYNCPAY_API_KEY e SYNCPAY_TOKEN nas variáveis de ambiente.",
            ok: !!process.env.SYNCPAY_API_KEY || !!process.env.SYNCPAY_TOKEN,
            critical: true,
        });

        const dontSellTemplate = await this.prisma.messageTemplate.findFirst({
            where: { key: MessageTemplateKey.DONT_SELL },
        });

        items.push({
            key: "dont_sell_template",
            label: 'Template "DONT_SELL" cadastrado (opcional)',
            description:
                'Enviado nos intervalos configurados. Chave: "DONT_SELL".',
            ok: !!dontSellTemplate,
            critical: false,
        });

        const discountConfig = botAccount
            ? await this.prisma.discountConfig.findUnique({
                  where: { botId: botAccount.id },
              })
            : null;

        items.push({
            key: "discount_config",
            label: "Desconto automático configurado (opcional)",
            description: "Configure em Configurações → Desconto.",
            ok: !!discountConfig?.isActive,
            critical: false,
        });

        const pixAudio = botAccount
            ? await this.prisma.pixAudioConfig.findFirst({
                  where: { botId: botAccount.id, isActive: true },
              })
            : null;

        items.push({
            key: "pix_audio",
            label: "Áudio de instruções PIX (opcional)",
            description: "Adicione em Configurações → Áudio PIX.",
            ok: !!pixAudio,
            critical: false,
        });

        return {
            allCriticalOk: items.filter((i) => i.critical).every((i) => i.ok),
            items,
        };
    }
}
