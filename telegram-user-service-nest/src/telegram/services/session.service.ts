// src/telegram/services/session.service.ts
//
// Responsabilidade única: fluxo de autenticação MTProto (OTP + 2FA).

import { Injectable, Logger } from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { PrismaService } from "../../prisma/prisma.service";
import { MtprotoProvider } from "../providers/mtproto.provider";

@Injectable()
export class SessionService {
    private readonly logger = new Logger(SessionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mtproto: MtprotoProvider,
    ) {}

    async sendCode(botId: string, phoneNumber: string) {
        const bot = await this.prisma.botAccount.findUnique({
            where: { id: botId },
        });
        if (!bot?.apiId || !bot?.apiHash)
            throw new Error("API ID/Hash faltando");

        // Descarta sessão temporária anterior se existir
        const existing = this.mtproto.getTempClient(botId);
        if (existing) {
            try {
                await existing.client.disconnect();
            } catch (_) {}
            this.mtproto.deleteTempClient(botId);
        }

        const client = new TelegramClient(
            new StringSession(""),
            Number(bot.apiId),
            bot.apiHash,
            { connectionRetries: 5 },
        );

        await client.connect();
        const { phoneCodeHash } = await client.sendCode(
            { apiId: Number(bot.apiId), apiHash: bot.apiHash },
            phoneNumber,
        );

        this.mtproto.setTempClient(botId, { client, phoneCodeHash });
        return { message: "Código enviado para o Telegram" };
    }

    async verifyCode(
        botId: string,
        phoneNumber: string,
        code: string,
    ): Promise<{ success: boolean; requires2FA?: boolean; session?: string }> {
        const temp = this.mtproto.getTempClient(botId);
        if (!temp) throw new Error("Sessão expirada. Solicite um novo código.");

        try {
            await temp.client.invoke(
                new Api.auth.SignIn({
                    phoneNumber,
                    phoneCodeHash: temp.phoneCodeHash!,
                    phoneCode: code,
                }),
            );
            return await this.mtproto.finalizeLogin(botId, temp.client);
        } catch (error: any) {
            if (error.errorMessage === "SESSION_PASSWORD_NEEDED") {
                return { success: false, requires2FA: true };
            }
            throw error;
        }
    }

    async verifyPassword(
        botId: string,
        password: string,
    ): Promise<{ success: boolean; session?: string }> {
        const temp = this.mtproto.getTempClient(botId);
        if (!temp) throw new Error("Sessão expirada. Solicite um novo código.");

        try {
            await (temp.client as any).signInWithPassword(
                {
                    apiId: temp.client.apiId,
                    apiHash: (temp.client as any).apiHash,
                },
                {
                    password: async () => password,
                    onError: (err: any) => {
                        throw err;
                    },
                },
            );
            return await this.mtproto.finalizeLogin(botId, temp.client);
        } catch (error: any) {
            this.logger.error("Erro no 2FA:", error);
            throw error;
        }
    }
}
