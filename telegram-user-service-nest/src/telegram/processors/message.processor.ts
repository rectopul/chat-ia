// src/telegram/processors/message.processor.ts

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { MediaService } from "../services/media.service";
import { MtprotoProvider } from "../providers/mtproto.provider";
import { QUEUE_NAME, SEND_MENU_JOB } from "../constants";
import { Logger } from "@nestjs/common";
import {
    BusinessCtx,
    MediaItem,
    ReadyItem,
    SendComboJobData,
    SendSingleMediaJobData,
} from "../interfaces";
import { BotApiProvider } from "../providers/bot-api.provider";
import { Api } from "telegram";
import { PrismaService } from "src/prisma/prisma.service";

export const SEND_COMBO_JOB = "send-combo";
export const SEND_SINGLE_JOB = "send-single-media";

@Processor(QUEUE_NAME, { concurrency: 2 })
export class MessageProcessor extends WorkerHost {
    private readonly logger = new Logger(MessageProcessor.name);

    constructor(
        private readonly media: MediaService,
        private readonly mtproto: MtprotoProvider,
        private readonly botApi: BotApiProvider,
        private readonly prisma: PrismaService,
    ) {
        super();
    }

    // ── Router ────────────────────────────────────────────────────────────

    async process(job: Job<any>): Promise<any> {
        this.logger.debug(
            `[processor] job=${job.name} id=${job.id} attempt=${job.attemptsMade + 1}`,
        );

        switch (job.name) {
            case SEND_COMBO_JOB:
                return this.processSendCombo(job as Job<SendComboJobData>);
            case SEND_SINGLE_JOB:
                return this.processSendSingle(
                    job as Job<SendSingleMediaJobData>,
                );
            case SEND_MENU_JOB:
                return this.processSendMenu(job);
            default:
                throw new Error(`Job desconhecido: ${job.name}`);
        }
    }

    // ── sendCombo ─────────────────────────────────────────────────────────

    private async processSendCombo(job: Job<SendComboJobData>): Promise<void> {
        const { botId, chatId, template, businessCtx } = job.data;

        if (businessCtx) {
            await this.sendComboBotApi(chatId, template, businessCtx, job);
            return;
        }

        await this.sendComboMtproto(botId, chatId, template, job);
    }

    // ── sendCombo via Bot API ─────────────────────────────────────────────

    private async sendComboBotApi(
        chatId: string,
        template: SendComboJobData["template"],
        ctx: BusinessCtx,
        job: Job,
    ): Promise<void> {
        const base = { business_connection_id: ctx.businessConnectionId };
        const sorted = [...template.mediaItems].sort(
            (a, b) => a.order - b.order,
        );

        const photos: MediaItem[] = [];
        const videos: MediaItem[] = [];
        const audios: MediaItem[] = [];

        for (const item of sorted) {
            const meta = this.media.getMediaMeta(item.url);
            const entry: MediaItem = {
                url: item.url,
                fileId: item.telegramFileId ?? undefined,
                itemId: item.id,
            };
            if (meta.isAudio) audios.push(entry);
            else if (meta.isVideo) videos.push(entry);
            else photos.push(entry);
        }

        const total = photos.length + videos.length + audios.length;
        let done = 0;

        if (template.text && photos.length === 0 && videos.length === 0) {
            await this.botApi.sendMessageHttp(
                ctx.token,
                chatId,
                template.text,
                base,
            );
        }

        if (photos.length > 0) {
            await this.media.sendPhotoGroup(ctx.token, chatId, base, photos);
            done += photos.length;
            await job.updateProgress(Math.round((done / total) * 100));
            await new Promise((r) => setTimeout(r, 400));
        }

        if (videos.length > 0) {
            await this.media.sendVideosMtproto(ctx.botId, chatId, base, videos);
            done += videos.length;
            await job.updateProgress(Math.round((done / total) * 100));
            await new Promise((r) => setTimeout(r, 400));
        }

        for (const audio of audios) {
            await this.media.sendVoiceBotApi(ctx.token, chatId, base, audio);
            done++;
            await job.updateProgress(Math.round((done / total) * 100));
            await new Promise((r) => setTimeout(r, 300));
        }
    }

    // ── sendCombo via MTProto ─────────────────────────────────────────────

    private async sendComboMtproto(
        botId: string,
        chatId: string,
        template: SendComboJobData["template"],
        job: Job,
    ): Promise<void> {
        const client = await this.mtproto.ensureClient(botId);
        const peer = await this.mtproto.resolvePeer(botId, chatId);

        const sortedMedia = [...template.mediaItems].sort(
            (a, b) => a.order - b.order,
        );
        const total = sortedMedia.length;

        if (template.text) {
            await client.sendMessage(peer, { message: template.text });
            await new Promise((r) => setTimeout(r, 300));
        }

        const readyItems: ReadyItem[] = [];

        for (let i = 0; i < sortedMedia.length; i++) {
            const item = sortedMedia[i];
            this.logger.debug(
                `[sendCombo] Preparando ${i + 1}/${total}: ${item.url}`,
            );
            readyItems.push(await this.media.prepareMedia(item, client, peer));
            await job.updateProgress(Math.round(((i + 1) / total) * 50));
        }

        let imageQueue: Api.InputSingleMedia[] = [];
        let sent = 0;

        const flushImageQueue = async () => {
            if (!imageQueue.length) return;

            if (imageQueue.length === 1) {
                await client.invoke(
                    new Api.messages.SendMedia({
                        peer,
                        media: imageQueue[0].media,
                        message: "",
                        randomId: this.mtproto.makeRandomId(),
                    }),
                );
            } else {
                await client.invoke(
                    new Api.messages.SendMultiMedia({
                        peer,
                        multiMedia: imageQueue,
                    }),
                );
            }

            sent += imageQueue.length;
            await job.updateProgress(50 + Math.round((sent / total) * 50));
            imageQueue = [];
            await new Promise((r) => setTimeout(r, 400));
        };

        for (const readyItem of readyItems) {
            if (readyItem.isImage || readyItem.isVideo) {
                imageQueue.push(
                    new Api.InputSingleMedia({
                        media: readyItem.finalMedia,
                        message: "",
                        randomId: this.mtproto.makeRandomId(),
                    }),
                );
            } else {
                await flushImageQueue();
                await client.invoke(
                    new Api.messages.SendMedia({
                        peer,
                        media: readyItem.finalMedia,
                        message: "",
                        randomId: this.mtproto.makeRandomId(),
                    }),
                );
                sent++;
                await job.updateProgress(50 + Math.round((sent / total) * 50));
                await new Promise((r) => setTimeout(r, 400));
            }
        }

        await flushImageQueue();
    }

    // ── sendSingleMedia ───────────────────────────────────────────────────

    private async processSendSingle(
        job: Job<SendSingleMediaJobData>,
    ): Promise<void> {
        const { botId, chatId, template, businessCtx } = job.data;

        const url = template.mediaUrl || template.mediaItems?.[0]?.url || "";
        const fileId =
            template.telegramFileId || template.mediaItems?.[0]?.telegramFileId;
        const itemId = template.mediaItems?.[0]?.id ?? template.id;
        const meta = this.media.getMediaMeta(url);

        if (!url) {
            this.logger.warn(
                `[processSendSingle] Template ${template.id} sem URL de mídia`,
            );
            return;
        }

        if (businessCtx) {
            const base = {
                business_connection_id: businessCtx.businessConnectionId,
            };

            if (meta.isAudio) {
                await this.media.sendVoiceBotApi(
                    businessCtx.token,
                    chatId,
                    base,
                    {
                        url,
                        fileId: fileId ?? undefined,
                        itemId,
                    },
                );
            } else if (meta.isVideo) {
                await this.media.sendVideosMtproto(botId, chatId, base, [
                    {
                        url,
                        fileId: fileId ?? undefined,
                        itemId,
                    },
                ]);
            } else {
                await this.media.sendPhotoGroup(
                    businessCtx.token,
                    chatId,
                    base,
                    [
                        {
                            url,
                            fileId: fileId ?? undefined,
                            itemId,
                        },
                    ],
                );
            }

            await job.updateProgress(100);
            return;
        }

        // MTProto path
        const client = await this.mtproto.ensureClient(botId);
        const peer = await this.mtproto.resolvePeer(botId, chatId);

        const fileBuffer = await this.media.fetchFileBuffer(url);

        if (meta.isVideo || meta.isAudio) {
            const uploaded = await this.media.uploadFromBuffer(
                client,
                `file.${meta.ext}`,
                fileBuffer,
            );
            const media = this.media.buildInputMedia(
                uploaded,
                meta,
                `file.${meta.ext}`,
                false,
            );
            await client.invoke(
                new Api.messages.SendMedia({
                    peer,
                    media,
                    message: template.text || "",
                    randomId: this.mtproto.makeRandomId(),
                }),
            );
        } else {
            await client.sendFile(peer, {
                file: fileBuffer,
                caption: template.text || undefined,
                forceDocument: false,
            });
        }

        await job.updateProgress(100);
    }

    private async processSendMenu(job: Job<any>): Promise<void> {
        const { token, chatId, businessConnectionId } = job.data;

        const products = await this.prisma.product.findMany({
            where: { isActive: true },
            orderBy: { priceCents: "asc" },
        });

        if (products.length > 0) {
            await this.botApi.sendMessageHttp(
                token,
                chatId,
                "🛍️ *Escolha o produto:*",
                {
                    business_connection_id: businessConnectionId,
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: products.map((p) => [
                            {
                                text: `${p.title} — R$ ${(p.priceCents / 100).toFixed(2).replace(".", ",")}`,
                                callback_data: `buy:${p.id}`,
                            },
                        ]),
                    },
                },
            );
        }
    }
}
