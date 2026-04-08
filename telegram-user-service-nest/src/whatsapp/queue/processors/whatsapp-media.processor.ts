import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { MediaHandlerService } from "../../messaging/media-handler.service";
import { WhatsappSenderService } from "../../messaging/whatsapp-sender.service";
import {
    WHATSAPP_MEDIA_OUTGOING_JOB_NAME,
    WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME,
} from "../constants/whatsapp-queue.constants";
import { WhatsappOutgoingJobData } from "../types/whatsapp-jobs.types";

@Processor(WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME, { concurrency: 1 })
export class WhatsappMediaProcessor extends WorkerHost {
    private readonly logger = new Logger(WhatsappMediaProcessor.name);

    constructor(
        private readonly mediaHandlerService: MediaHandlerService,
        private readonly whatsappSenderService: WhatsappSenderService,
    ) {
        super();
    }

    async process(job: Job<WhatsappOutgoingJobData>): Promise<void> {
        if (job.name !== WHATSAPP_MEDIA_OUTGOING_JOB_NAME) {
            throw new Error(
                `Unsupported WhatsApp media job received: ${job.name}`,
            );
        }

        const prepared = job.data.prepared
            ? job.data
            : await this.mediaHandlerService.prepareOutgoingMessage(job.data);

        await this.whatsappSenderService.sendQueuedMessage(
            prepared,
            String(job.id ?? ""),
        );

        this.logger.debug(
            `[process] Midia WhatsApp enviada instanceId=${prepared.instanceId} chatId=${prepared.chatId}`,
        );
    }
}
