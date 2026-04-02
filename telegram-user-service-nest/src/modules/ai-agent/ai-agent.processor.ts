import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { TelegramClient } from "telegram";
import { Job } from "bullmq";
import { BusinessCtx } from "../../telegram/interfaces";
import { BotApiProvider } from "../../telegram/providers/bot-api.provider";
import { MtprotoProvider } from "../../telegram/providers/mtproto.provider";
import { ChatActionService } from "../../telegram/services/chat-action.service";
import { TemplateService } from "../../telegram/services/template.service";
import { AiAgentCommerceService } from "./ai-agent-commerce.service";
import {
    AI_RESPONSE_JOB_NAME,
    AI_RESPONSE_QUEUE_NAME,
    AiAgentReply,
    AiResponseJobData,
    AiAgentService,
} from "./ai-agent.service";

@Processor(AI_RESPONSE_QUEUE_NAME, { concurrency: 3 })
export class AiAgentProcessor extends WorkerHost {
    private readonly logger = new Logger(AiAgentProcessor.name);

    constructor(
        private readonly aiAgentService: AiAgentService,
        private readonly botApi: BotApiProvider,
        private readonly mtproto: MtprotoProvider,
        private readonly chatAction: ChatActionService,
        private readonly templateService: TemplateService,
        private readonly commerceService: AiAgentCommerceService,
    ) {
        super();
    }

    async process(job: Job<AiResponseJobData>): Promise<void> {
        if (job.name !== AI_RESPONSE_JOB_NAME) {
            throw new Error(`Unsupported job received: ${job.name}`);
        }

        try {
            await job.updateProgress(20);

            const reply: AiAgentReply =
                await this.aiAgentService.generateResponse(job.data);

            await job.updateProgress(60);

            const typingDelay =
                this.chatAction.calculateTypingDelay(reply.text);

            if (job.data.transport === "business") {
                await this.sendBusinessResponse(
                    job.data,
                    reply.text,
                    typingDelay,
                );
            } else {
                await this.sendMtprotoResponse(
                    job.data,
                    reply.text,
                    typingDelay,
                );
            }

            await this.aiAgentService.saveModelMessage(
                job.data.telegramId,
                reply.text,
            );

            try {
                if (reply.productIdToCharge) {
                    await this.sendPixCharge(job.data, reply.productIdToCharge);
                }
            } catch (error) {
                this.logger.error(
                    `[process] Failed to send PIX for telegramId=${job.data.telegramId}`,
                    error instanceof Error ? error.stack : String(error),
                );
            }

            try {
                await this.sendPreviewTemplates(
                    job.data,
                    reply.previewTemplateIds,
                );
            } catch (error) {
                this.logger.error(
                    `[process] Failed to send previews for telegramId=${job.data.telegramId}`,
                    error instanceof Error ? error.stack : String(error),
                );
            }

            await job.updateProgress(100);
        } catch (error) {
            this.logger.error(
                `[process] Failed for telegramId=${job.data.telegramId} attempt=${job.attemptsMade + 1}`,
                error instanceof Error ? error.stack : String(error),
            );
            throw error;
        }
    }

    private async sendBusinessResponse(
        data: AiResponseJobData,
        responseText: string,
        typingDelay: number,
    ): Promise<void> {
        if (!data.token || !data.businessConnectionId) {
            throw new Error(
                `Business response data is incomplete for chatId=${data.chatId}`,
            );
        }

        await this.chatAction.sendActionBotApi(
            data.token,
            data.chatId,
            "typing",
            data.businessConnectionId,
            typingDelay,
        );

        await this.botApi.sendMessageHttp(data.token, data.chatId, responseText, {
            business_connection_id: data.businessConnectionId,
        });
    }

    private async sendMtprotoResponse(
        data: AiResponseJobData,
        responseText: string,
        typingDelay: number,
    ): Promise<void> {
        const client: TelegramClient = await this.mtproto.ensureClient(data.botId);
        const peer = await this.mtproto.resolvePeer(data.botId, data.chatId);

        await this.chatAction.sendActionMtproto(
            client,
            peer,
            "typing",
            typingDelay,
        );

        await client.sendMessage(peer, {
            message: responseText,
        });
    }

    private async sendPreviewTemplates(
        data: AiResponseJobData,
        templateIds: string[],
    ): Promise<void> {
        if (!templateIds.length) {
            return;
        }

        const templates = await this.aiAgentService.getTemplatesByIds(templateIds);

        for (const template of templates) {
            const businessCtx: BusinessCtx | undefined =
                data.transport === "business" && data.token && data.businessConnectionId
                    ? {
                          token: data.token,
                          businessConnectionId: data.businessConnectionId,
                          botId: data.botId,
                      }
                    : undefined;

            await this.templateService.sendTemplate(
                data.botId,
                data.chatId,
                template,
                businessCtx,
            );

            await this.aiAgentService.savePreviewDeliveryLog(
                data.botId,
                data.chatId,
                template,
            );
        }
    }

    private async sendPixCharge(
        data: AiResponseJobData,
        productId: string,
    ): Promise<void> {
        const charge = await this.commerceService.createPixCharge(
            data.botId,
            data.chatId,
            productId,
        );

        const typingDelay =
            this.chatAction.calculateTypingDelay(charge.pixMessage);

        if (data.transport === "business") {
            await this.sendBusinessResponse(data, charge.pixMessage, typingDelay);
        } else {
            await this.sendMtprotoResponse(data, charge.pixMessage, typingDelay);
        }

        await this.aiAgentService.saveModelMessage(
            data.telegramId,
            charge.pixMessage,
        );
    }
}
