import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { AiAgentService } from "../../../modules/ai-agent/ai-agent.service";
import { MediaHandlerService } from "../../messaging/media-handler.service";
import { WhatsappSenderService } from "../../messaging/whatsapp-sender.service";
import { WhatsappIncomingDebounceService } from "../services/whatsapp-incoming-debounce.service";
import {
    WHATSAPP_OUTGOING_JOB_NAME,
    WHATSAPP_OUTGOING_QUEUE_NAME,
} from "../constants/whatsapp-queue.constants";
import { WhatsappQueueService } from "../services/whatsapp-queue.service";
import { WhatsappOutgoingJobData } from "../types/whatsapp-jobs.types";

const DEFERRED_CART_CONFIRMATION_DELAY_MS = 5_000;

@Processor(WHATSAPP_OUTGOING_QUEUE_NAME, { concurrency: 3 })
export class WhatsappOutgoingProcessor extends WorkerHost {
    private readonly logger = new Logger(WhatsappOutgoingProcessor.name);

    constructor(
        private readonly aiAgentService: AiAgentService,
        private readonly mediaHandlerService: MediaHandlerService,
        private readonly whatsappIncomingDebounceService: WhatsappIncomingDebounceService,
        private readonly whatsappQueueService: WhatsappQueueService,
        private readonly whatsappSenderService: WhatsappSenderService,
    ) {
        super();
    }

    async process(job: Job<WhatsappOutgoingJobData>): Promise<void> {
        if (job.name !== WHATSAPP_OUTGOING_JOB_NAME) {
            throw new Error(
                `Unsupported WhatsApp outgoing job received: ${job.name}`,
            );
        }

        if (await this.shouldSkipDeferredConfirmation(job.data)) {
            this.logger.debug(
                `[process] confirmacao atrasada descartada instanceId=${job.data.instanceId} chatId=${job.data.chatId}`,
            );
            return;
        }

        const prepared = job.data.prepared
            ? job.data
            : await this.mediaHandlerService.prepareOutgoingMessage(job.data);

        if (prepared.messageType === "VIDEO") {
            await this.whatsappQueueService.enqueueMediaMessage(prepared);

            this.logger.debug(
                `[process] Midia pesada delegada para fila separada instanceId=${prepared.instanceId} chatId=${prepared.chatId}`,
            );
            return;
        }

        await this.whatsappSenderService.sendQueuedMessage(
            prepared,
            String(job.id ?? ""),
        );

        if (this.isDeferredCartConfirmation(prepared)) {
            await this.aiAgentService.saveWhatsappModelMessage(
                prepared.instanceId,
                prepared.chatId,
                prepared.text,
            );
        }

        this.logger.debug(
            `[process] WhatsApp enviado instanceId=${prepared.instanceId} chatId=${prepared.chatId}`,
        );
    }

    private async shouldSkipDeferredConfirmation(
        data: WhatsappOutgoingJobData,
    ): Promise<boolean> {
        if (!this.isDeferredCartConfirmation(data)) {
            return false;
        }

        const payload = this.asRecord(data.payload);
        const expectedActivityToken =
            typeof payload.expectedIncomingActivityToken === "string"
                ? payload.expectedIncomingActivityToken.trim()
                : "";

        if (!expectedActivityToken) {
            return true;
        }

        const minimumSilenceMs = Number(
            payload.minimumSilenceMs ?? DEFERRED_CART_CONFIRMATION_DELAY_MS,
        );

        return !(
            await this.whatsappIncomingDebounceService.shouldDispatchDeferredConfirmation(
                {
                    instanceId: data.instanceId,
                    chatId: data.chatId,
                    expectedActivityToken,
                    minimumSilenceMs:
                        Number.isFinite(minimumSilenceMs) &&
                        minimumSilenceMs > 0
                            ? Math.trunc(minimumSilenceMs)
                            : DEFERRED_CART_CONFIRMATION_DELAY_MS,
                },
            )
        );
    }

    private isDeferredCartConfirmation(data: WhatsappOutgoingJobData): boolean {
        const payload = this.asRecord(data.payload);
        return payload.source === "delayed-cart-confirmation";
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== "object") {
            return {};
        }

        return value as Record<string, unknown>;
    }
}
