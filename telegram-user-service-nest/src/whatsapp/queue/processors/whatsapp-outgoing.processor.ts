import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { MediaHandlerService } from "../../messaging/media-handler.service";
import { WhatsappSenderService } from "../../messaging/whatsapp-sender.service";
import {
    WHATSAPP_OUTGOING_JOB_NAME,
    WHATSAPP_OUTGOING_QUEUE_NAME,
} from "../constants/whatsapp-queue.constants";
import { WhatsappQueueService } from "../services/whatsapp-queue.service";
import { WhatsappOutgoingJobData } from "../types/whatsapp-jobs.types";

@Processor(WHATSAPP_OUTGOING_QUEUE_NAME, { concurrency: 3 })
export class WhatsappOutgoingProcessor extends WorkerHost {
    private readonly logger = new Logger(WhatsappOutgoingProcessor.name);

    constructor(
        private readonly mediaHandlerService: MediaHandlerService,
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

        this.logger.debug(
            `[process] WhatsApp enviado instanceId=${prepared.instanceId} chatId=${prepared.chatId}`,
        );
    }
}
