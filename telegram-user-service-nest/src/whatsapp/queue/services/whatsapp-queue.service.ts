import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { WhatsappInstanceService } from "../../application/instances/whatsapp-instance.service";
import {
    WHATSAPP_INCOMING_JOB_NAME,
    WHATSAPP_INCOMING_QUEUE_NAME,
    WHATSAPP_MEDIA_OUTGOING_JOB_NAME,
    WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME,
    WHATSAPP_OUTGOING_JOB_NAME,
    WHATSAPP_OUTGOING_QUEUE_NAME,
} from "../constants/whatsapp-queue.constants";
import {
    WhatsappIncomingJobData,
    WhatsappOutgoingJobData,
} from "../types/whatsapp-jobs.types";

type QueueScheduleOptions = {
    delay?: number;
};

@Injectable()
export class WhatsappQueueService {
    constructor(
        private readonly whatsappInstanceService: WhatsappInstanceService,
        @InjectQueue(WHATSAPP_INCOMING_QUEUE_NAME)
        private readonly incomingQueue: Queue<WhatsappIncomingJobData>,
        @InjectQueue(WHATSAPP_OUTGOING_QUEUE_NAME)
        private readonly outgoingQueue: Queue<WhatsappOutgoingJobData>,
        @InjectQueue(WHATSAPP_MEDIA_OUTGOING_QUEUE_NAME)
        private readonly mediaQueue: Queue<WhatsappOutgoingJobData>,
    ) {}

    async enqueueIncomingMessage(data: WhatsappIncomingJobData) {
        await this.whatsappInstanceService.ensureInstanceExists(data.instanceId);

        return this.incomingQueue.add(
            WHATSAPP_INCOMING_JOB_NAME,
            {
                ...data,
                messageType: data.messageType ?? "TEXT",
            },
            {
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 100 },
            },
        );
    }

    async enqueueOutgoingMessage(
        data: WhatsappOutgoingJobData,
        options?: QueueScheduleOptions,
    ) {
        await this.whatsappInstanceService.ensureInstanceExists(data.instanceId);

        return this.outgoingQueue.add(
            WHATSAPP_OUTGOING_JOB_NAME,
            {
                ...data,
                messageType: data.messageType ?? "TEXT",
            },
            {
                delay: options?.delay ?? 0,
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 100 },
            },
        );
    }

    async enqueueMediaMessage(
        data: WhatsappOutgoingJobData,
        options?: QueueScheduleOptions,
    ) {
        await this.whatsappInstanceService.ensureInstanceExists(data.instanceId);

        return this.mediaQueue.add(
            WHATSAPP_MEDIA_OUTGOING_JOB_NAME,
            {
                ...data,
                messageType: data.messageType ?? "VIDEO",
                prepared: data.prepared ?? true,
            },
            {
                delay: options?.delay ?? 0,
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 100 },
            },
        );
    }
}
