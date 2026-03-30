// src/telegram/services/chat-action.service.ts
//
// Responsabilidade única: simular ações humanas no chat (digitando, gravando áudio).
// Envia ChatAction via Bot API ou MTProto e aguarda delay proporcional ao conteúdo.

import { Injectable, Logger } from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import axios from "axios";
import bigInt from "big-integer";

type ChatActionType =
    | "typing"
    | "record_voice"
    | "upload_photo"
    | "upload_video";

@Injectable()
export class ChatActionService {
    private readonly logger = new Logger(ChatActionService.name);

    // ── Delays base (em ms) para cada tipo de ação ───────────────────────
    private readonly BASE_DELAYS = {
        typing: 1500, // 1.5s base para texto
        record_voice: 2000, // 2s base para áudio
        upload_photo: 1000, // 1s base para foto
        upload_video: 2500, // 2.5s base para vídeo
    };

    // ── API Bot (Business Context) ────────────────────────────────────────

    /**
     * Envia ação de chat via Bot API HTTP.
     * Usado em contexto business (quando tem businessConnectionId).
     */
    async sendActionBotApi(
        token: string,
        chatId: string | number,
        action: ChatActionType,
        businessConnectionId?: string,
        durationMs?: number,
    ): Promise<void> {
        try {
            const url = `https://api.telegram.org/bot${token}/sendChatAction`;
            const payload: any = {
                chat_id: chatId,
                action,
            };

            if (businessConnectionId) {
                payload.business_connection_id = businessConnectionId;
            }

            await axios.post(url, payload);

            const delay = durationMs ?? this.BASE_DELAYS[action];
            this.logger.debug(
                `[ChatAction] ${action} enviado para chatId=${chatId}, aguardando ${delay}ms`,
            );

            await this.sleep(delay);
        } catch (err: any) {
            // Não crítico — se falhar, continua sem a ação
            this.logger.warn(
                `[ChatAction] Falha ao enviar ${action} para ${chatId}: ${err?.message}`,
            );
        }
    }

    // ── MTProto (Direct Client) ──────────────────────────────────────────

    /**
     * Envia ação de chat via MTProto.
     * Usado quando NÃO há businessConnectionId (conversa direta via MTProto).
     */
    async sendActionMtproto(
        client: TelegramClient,
        chatId: string,
        action: ChatActionType,
        durationMs?: number,
    ): Promise<void> {
        try {
            const peer = await client.getInputEntity(chatId);
            const mtprotoAction = this.mapToMtprotoAction(action);

            await client.invoke(
                new Api.messages.SetTyping({
                    peer,
                    action: mtprotoAction,
                }),
            );

            const delay = durationMs ?? this.BASE_DELAYS[action];
            this.logger.debug(
                `[ChatAction] ${action} enviado via MTProto para chatId=${chatId}, aguardando ${delay}ms`,
            );

            await this.sleep(delay);
        } catch (err: any) {
            this.logger.warn(
                `[ChatAction] Falha ao enviar ${action} via MTProto para ${chatId}: ${err?.message}`,
            );
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /**
     * Mapeia ação da Bot API para classe MTProto equivalente.
     */
    private mapToMtprotoAction(
        action: ChatActionType,
    ): Api.TypeSendMessageAction {
        switch (action) {
            case "typing":
                return new Api.SendMessageTypingAction();
            case "record_voice":
                return new Api.SendMessageRecordAudioAction();
            case "upload_photo":
                return new Api.SendMessageUploadPhotoAction({ progress: 0 });
            case "upload_video":
                return new Api.SendMessageUploadVideoAction({ progress: 0 });
            default:
                return new Api.SendMessageTypingAction();
        }
    }

    /**
     * Calcula delay baseado no tamanho do texto (mais texto = mais tempo "digitando").
     */
    calculateTypingDelay(text: string): number {
        if (!text) return this.BASE_DELAYS.typing;

        // ~40 palavras por minuto = ~150ms por palavra
        const wordCount = text.split(/\s+/).length;
        const calculatedDelay = Math.min(wordCount * 150, 5000); // máximo 5s

        return Math.max(calculatedDelay, this.BASE_DELAYS.typing);
    }

    /**
     * Calcula delay baseado na quantidade de mídias (mais itens = mais tempo).
     */
    calculateMediaDelay(action: ChatActionType, itemCount: number = 1): number {
        const baseDelay = this.BASE_DELAYS[action];
        // Adiciona 500ms por item extra
        return Math.min(baseDelay + (itemCount - 1) * 500, 5000);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
