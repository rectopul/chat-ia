// src/telegram/services/media.service.ts
//
// Responsabilidade única: operações de mídia — ffmpeg, sharp, buffers,
// upload MTProto, envio Bot API (fotos, vídeos, áudios).
// Não conhece lógica de negócio nem PrismaService diretamente.

import { Injectable, Logger } from "@nestjs/common";
import { TelegramClient, Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import axios from "axios";
import { Buffer } from "buffer";
import bigInt from "big-integer";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { MediaMeta, ReadyItem, MediaItem } from "../interfaces";
import { PrismaService } from "src/prisma/prisma.service";
import { MtprotoProvider } from "../providers/mtproto.provider";
import { ChatActionService } from "./chat-action.service";
const FormData = require("form-data");

@Injectable()
export class MediaService {
    private readonly logger = new Logger(MediaService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly mtproto: MtprotoProvider,
        private readonly chatAction: ChatActionService,
    ) {}

    /**
     * Obtém a media pronta para envio.
     * Se já existir no cache, retorna um InputDocument (reuso).
     * Se não existir, faz o processamento e retorna o buffer para upload.
     */
    async getMediaForTelegram(url: string): Promise<{
        inputMedia?: Api.InputMediaDocument | Api.InputMediaPhoto;
        buffer?: Buffer;
        meta: any;
    }> {
        const cache = await this.prisma.mediaCache.findUnique({
            where: { url },
        });
        const meta = this.getMediaMeta(url);

        // Lógica de Reuso: Se temos o DocId e o AccessHash de um vídeo/arquivo
        if (cache?.telegramDocId && cache?.accessHash && !meta.isImage) {
            this.logger.log(`Reutilizando mídia do cache: ${url}`);

            const inputMedia = new Api.InputMediaDocument({
                id: new Api.InputDocument({
                    id: bigInt(cache.telegramDocId),
                    accessHash: bigInt(cache.accessHash),
                    fileReference: cache.fileReference
                        ? Buffer.from(cache.fileReference)
                        : Buffer.alloc(0),
                }),
            });

            return { inputMedia, meta };
        }

        // Se for imagem ou não tiver cache, precisamos do buffer
        this.logger.log(
            `Mídia não encontrada no cache ou é imagem. Baixando: ${url}`,
        );
        let buffer = await this.fetchFileBuffer(url);

        // Se for áudio, aplicamos a conversão necessária para Telegram
        if (meta.isAudio) {
            buffer = await this.convertToOggOpus(buffer, meta.ext);
        }

        return { buffer, meta };
    }

    /**
     * Divide um array em sub-arrays de tamanho específico.
     * Útil para respeitar o limite de 10 mídias por álbum do Telegram.
     */
    chunkMedia<T>(items: T[], size: number = 10): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += size) {
            chunks.push(items.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Salva os dados de um upload bem sucedido para reuso futuro
     */
    async saveMediaCache(url: string, document: Api.Document) {
        const size =
            typeof document.size === "number"
                ? document.size
                : document.size.toJSNumber
                  ? document.size.toJSNumber()
                  : Number(document.size);

        await this.prisma.mediaCache.upsert({
            where: { url },
            update: {
                telegramDocId: document.id.toString(),
                accessHash: document.accessHash.toString(),
                fileReference: document.fileReference
                    ? Buffer.from(document.fileReference)
                    : null,
                size: size,
                mimeType: document.mimeType,
            },
            create: {
                url,
                telegramDocId: document.id.toString(),
                accessHash: document.accessHash.toString(),
                fileReference: document.fileReference
                    ? Buffer.from(document.fileReference)
                    : null,
                size: size,
                mimeType: document.mimeType,
            },
        });
    }

    // ── Meta ──────────────────────────────────────────────────────────────

    getMediaMeta(url: string): MediaMeta {
        const rawExt = (
            url.split(".").pop()?.split(/[#?]/)[0] ?? "jpg"
        ).toLowerCase();
        const ext = rawExt === "webp" ? "jpg" : rawExt;

        const isVideo = ["mp4", "mov", "avi", "mkv", "webm"].includes(ext);
        const isAudio = ["mp3", "ogg", "wav", "m4a", "aac", "flac"].includes(
            ext,
        );
        const isImage = !isVideo && !isAudio;

        let mimeType = "image/jpeg";
        if (ext === "png") mimeType = "image/png";
        if (ext === "gif") mimeType = "image/gif";
        if (isVideo) mimeType = ext === "mov" ? "video/quicktime" : "video/mp4";
        if (isAudio) mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;

        return { ext, mimeType, isVideo, isAudio, isImage };
    }

    // ── Buffer helpers ────────────────────────────────────────────────────

    async fetchFileBuffer(url: string, forceOgg = false): Promise<Buffer> {
        let buffer: Buffer;
        // 1. Verifica se a URL é local (se começa com seu domínio ou se é um caminho relativo)
        const isLocal =
            url.includes("localhost") ||
            url.includes("seu-dominio.com") ||
            !url.startsWith("http");

        this.logger.debug(
            `[fetchFileBuffer] Verificando se a URL é local: ${url}`,
        );

        if (isLocal) {
            try {
                // Extrai o caminho relativo (ex: templates/arquivo.mp4)
                // Se a URL for http://dominio.com/templates/file.mp4, o split pega a partir de /templates/
                const relativePath = url.includes("/templates/")
                    ? `../../public/templates/${url.split("/templates/")[1]}`
                    : url;

                const filePath = path.join(
                    process.cwd(),
                    "public",
                    relativePath,
                );
                this.logger.debug(
                    `[fetchFileBuffer] Lendo arquivo local: ${filePath}`,
                );
                buffer = await fs.promises.readFile(filePath);
            } catch (err: any) {
                this.logger.error(
                    `[fetchFileBuffer] Erro ao ler arquivo local: ${err.message}`,
                );
                // Se falhar localmente, tenta via axios como fallback
                const response = await axios.get(url, {
                    responseType: "arraybuffer",
                });
                buffer = Buffer.from(response.data);
            }
        } else {
            // 2. Se for URL externa (Vercel, S3, etc), continua usando Axios
            const response = await axios.get(url, {
                responseType: "arraybuffer",
            });
            buffer = Buffer.from(response.data);
        }

        const rawExt = (
            url.split(".").pop()?.split(/[#?]/)[0] ?? ""
        ).toLowerCase();

        if (rawExt === "webp") {
            const sharp = require("sharp");
            return await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        }

        const isAudioExt = ["mp3", "wav", "m4a", "aac", "flac"].includes(
            rawExt,
        );
        if (forceOgg && isAudioExt) {
            return await this.convertToOggOpus(buffer, rawExt);
        }

        return buffer;
    }

    async convertToOggOpus(
        inputBuffer: Buffer,
        inputExt: string,
    ): Promise<Buffer> {
        const ffmpeg = require("fluent-ffmpeg");
        const tmpInput = path.join(
            os.tmpdir(),
            `tg_audio_in_${Date.now()}.${inputExt}`,
        );
        const tmpOutput = path.join(
            os.tmpdir(),
            `tg_audio_out_${Date.now()}.ogg`,
        );

        await fs.promises.writeFile(tmpInput, inputBuffer);

        try {
            await new Promise<void>((resolve, reject) => {
                ffmpeg(tmpInput)
                    .audioCodec("libopus")
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .format("ogg")
                    .on("end", resolve)
                    .on("error", (err: any) =>
                        reject(
                            new Error(
                                `ffmpeg conversion failed: ${err?.message ?? JSON.stringify(err)}`,
                            ),
                        ),
                    )
                    .save(tmpOutput);
            });
        } finally {
            await fs.promises.unlink(tmpInput).catch(() => {});
        }

        const outputBuffer = await fs.promises.readFile(tmpOutput);
        await fs.promises.unlink(tmpOutput).catch(() => {});
        return outputBuffer;
    }

    async getAudioDuration(buffer: Buffer): Promise<number> {
        const ffmpeg = require("fluent-ffmpeg");
        return new Promise<number>((resolve, reject) => {
            const tmpPath = path.join(
                os.tmpdir(),
                `tg_probe_${Date.now()}.ogg`,
            );
            fs.writeFileSync(tmpPath, buffer);
            ffmpeg.ffprobe(tmpPath, (err: any, metadata: any) => {
                fs.unlink(tmpPath, () => {});
                if (err) return reject(err);
                resolve(Math.ceil(metadata?.format?.duration ?? 0));
            });
        });
    }

    // ── MTProto upload helpers ────────────────────────────────────────────

    async uploadFromBuffer(
        client: TelegramClient,
        filename: string,
        buffer: Buffer,
    ): Promise<Api.TypeInputFile> {
        const tmpPath = path.join(os.tmpdir(), `tg_${Date.now()}_${filename}`);
        await fs.promises.writeFile(tmpPath, buffer);
        try {
            const customFile = new CustomFile(filename, buffer.length, tmpPath);
            return await client.uploadFile({ file: customFile, workers: 3 });
        } finally {
            await fs.promises.unlink(tmpPath).catch(() => {});
        }
    }

    buildInputMedia(
        uploadedFile: Api.TypeInputFile,
        meta: MediaMeta,
        filename: string,
        forAlbum: boolean,
    ): Api.TypeInputMedia {
        const { mimeType, isVideo, isAudio } = meta;

        if (isVideo) {
            return new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType,
                attributes: [
                    new Api.DocumentAttributeVideo({
                        duration: 0,
                        w: 0,
                        h: 0,
                        supportsStreaming: true,
                        roundMessage: false,
                    }),
                    new Api.DocumentAttributeFilename({ fileName: filename }),
                ],
            });
        }

        if (isAudio) {
            return new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: "audio/ogg",
                attributes: [
                    new Api.DocumentAttributeAudio({
                        duration: 0,
                        voice: true,
                    }),
                ],
            });
        }

        return new Api.InputMediaUploadedPhoto({ file: uploadedFile });
    }

    async prepareMedia(
        item: { url: string },
        client: TelegramClient,
        peer: Api.TypeInputPeer,
    ): Promise<ReadyItem> {
        // 1. Tenta buscar do MediaService (Cache de Banco de Dados)
        const { inputMedia, buffer, meta } = await this.getMediaForTelegram(
            item.url,
        );

        // 2. Se retornou inputMedia, o arquivo já existe no Telegram. Retorno imediato!
        if (inputMedia) {
            return {
                finalMedia: inputMedia,
                isImage: meta.isImage,
                isVideo: meta.isVideo,
                isAudio: meta.isAudio,
            };
        }

        // 3. Se não tem cache, precisamos fazer o upload do buffer
        if (!buffer) {
            throw new Error(`Buffer não encontrado para o arquivo ${item.url}`);
        }

        const filename = `file_${Date.now()}.${meta.ext}`;

        // Faz o upload dos bytes crus para o servidor do Telegram
        const uploadedFile = await this.uploadFromBuffer(
            client,
            filename,
            buffer,
        );

        // Converte o arquivo uploadado em um objeto "UploadedMedia"
        const uploadedMedia = this.buildInputMedia(
            uploadedFile,
            meta,
            filename,
            true, // forceDocument: true para vídeos/áudios
        );

        // 4. Registra a mídia no servidor do Telegram para obter o ID definitivo e o AccessHash
        const serverMedia = await client.invoke(
            new Api.messages.UploadMedia({ peer, media: uploadedMedia }),
        );

        let finalMedia: Api.TypeInputMedia;

        // 5. Trata a resposta e SALVA NO CACHE para a próxima vez
        if (
            serverMedia instanceof Api.MessageMediaPhoto &&
            serverMedia.photo instanceof Api.Photo
        ) {
            const p = serverMedia.photo;
            finalMedia = new Api.InputMediaPhoto({
                id: new Api.InputPhoto({
                    id: p.id,
                    accessHash: p.accessHash,
                    fileReference: p.fileReference,
                }),
            });
            // Opcional: Você pode implementar cache de fotos também se desejar
        } else if (
            serverMedia instanceof Api.MessageMediaDocument &&
            serverMedia.document instanceof Api.Document
        ) {
            const d = serverMedia.document;

            // --- AQUI ESTÁ O PULO DO GATO ---
            // Salva no banco de dados para que na próxima chamada o 'inputMedia' (passo 1) exista
            await this.saveMediaCache(item.url, d);

            finalMedia = new Api.InputMediaDocument({
                id: new Api.InputDocument({
                    id: d.id,
                    accessHash: d.accessHash,
                    fileReference: d.fileReference,
                }),
            });
        } else {
            throw new Error(
                `UploadMedia retornou tipo inesperado: ${(serverMedia as any).className}`,
            );
        }

        return {
            finalMedia,
            isImage: meta.isImage,
            isVideo: meta.isVideo,
            isAudio: meta.isAudio,
        };
    }

    // ── Bot API send helpers ──────────────────────────────────────────────

    async sendPhotoGroup(
        token: string,
        chatId: string,
        base: Record<string, any>,
        items: MediaItem[],
    ): Promise<void> {
        if (!items.length) return;

        const businessConnectionId = base.business_connection_id;

        if (businessConnectionId) {
            const delay = this.chatAction.calculateMediaDelay(
                "upload_photo",
                items.length,
            );
            await this.chatAction.sendActionBotApi(
                token,
                chatId,
                "upload_photo",
                businessConnectionId,
                delay,
            );
        }

        for (let i = 0; i < items.length; i += 10) {
            const chunk = items.slice(i, i + 10);
            const form = new FormData();

            form.append("chat_id", chatId);
            if (base.business_connection_id) {
                form.append(
                    "business_connection_id",
                    base.business_connection_id,
                );
            }

            const mediaGroup: any[] = [];

            for (let j = 0; j < chunk.length; j++) {
                const item = chunk[j];

                if (item.fileId) {
                    // Se já temos o fileId (cache), usamos ele (mais rápido)
                    mediaGroup.push({
                        type: "photo",
                        media: item.fileId,
                    });
                } else {
                    // Se não tem fileId, precisamos enviar o arquivo físico
                    // Usamos o fetchFileBuffer que já criamos para ler do disco local
                    const buffer = await this.fetchFileBuffer(item.url);
                    const attachmentName = `pic${j}`;

                    form.append(attachmentName, buffer, {
                        filename: `image_${j}.jpg`,
                        contentType: "image/jpeg",
                    });

                    mediaGroup.push({
                        type: "photo",
                        media: `attach://${attachmentName}`,
                    });
                }
            }

            form.append("media", JSON.stringify(mediaGroup));

            try {
                const { data } = await axios.post(
                    `https://api.telegram.org/bot${token}/sendMediaGroup`,
                    form,
                    {
                        headers: form.getHeaders(),
                        timeout: 30000, // Aumentado para uploads grandes
                    },
                );

                // Tenta salvar os novos file_ids para futuras repetições serem instantâneas
                if (data.ok && data.result) {
                    for (let k = 0; k < data.result.length; k++) {
                        const msg = data.result[k];
                        const photo = msg.photo?.pop(); // Pega a maior resolução
                        if (photo && chunk[k].itemId) {
                            await this.saveFileId(
                                String(chunk[k].itemId),
                                true,
                                photo.file_id,
                            );
                        }
                    }
                }
            } catch (err: any) {
                this.logger.error(
                    `[sendPhotoGroup] Erro ao enviar grupo: ${err.response?.data?.description || err.message}`,
                );
                throw err; // Lança para o BullMQ tentar novamente se necessário
            }

            if (items.length > 10) await new Promise((r) => setTimeout(r, 500));
        }
    }

    async sendVideosMtproto(
        botId: string,
        chatId: string,
        base: Record<string, any>,
        items: MediaItem[],
    ): Promise<void> {
        let client = this.mtproto.getClient(botId);
        if (!client)
            throw new Error(`MTProto client não encontrado para bot ${botId}`);

        if (!client.connected) {
            this.logger.warn(
                `[sendVideos] Client desconectado, reconectando...`,
            );
            await Promise.race([
                client.connect(),
                new Promise((_, reject) =>
                    setTimeout(
                        () =>
                            reject(new Error("Timeout ao reconectar MTProto")),
                        15000,
                    ),
                ),
            ]);
        }

        const peer = new Api.InputPeerUser({
            userId: bigInt(chatId.toString()),
            accessHash: bigInt(0),
        });

        for (const item of items) {
            try {
                await this.processAndSendSingleVideo(client, peer, item);
            } catch (error: any) {
                // SE O ERRO FOR EXPIRAÇÃO DE REFERÊNCIA
                if (error.message?.includes("FILE_REFERENCE_EXPIRED")) {
                    this.logger.warn(
                        `[MTProto] File Reference expirado para ${item.url}. Limpando cache e tentando novamente...`,
                    );

                    // 1. Remove do banco de dados para forçar novo upload/registro
                    await this.prisma.mediaCache.deleteMany({
                        where: { url: item.url },
                    });

                    // 2. Tenta enviar de novo (agora vai regenerar o cache)
                    try {
                        await this.processAndSendSingleVideo(
                            client,
                            peer,
                            item,
                        );
                    } catch (retryError: any) {
                        this.logger.error(
                            `[MTProto] Falha na segunda tentativa após expiração: ${retryError.message}`,
                        );
                    }
                } else {
                    this.logger.error(
                        `[MTProto] Erro ao enviar vídeo: ${error.message}`,
                    );
                }
            }
            await new Promise((r) => setTimeout(r, 800)); // Delay um pouco maior para evitar flood
        }
    }

    /**
     * Encapsulamento da lógica interna para facilitar a tentativa de reenvio
     */
    private async processAndSendSingleVideo(
        client: any,
        peer: any,
        item: MediaItem,
    ): Promise<void> {
        const { inputMedia, buffer, meta } = await this.getMediaForTelegram(
            item.url,
        );

        let finalMedia: Api.TypeInputMedia;

        if (inputMedia) {
            this.logger.debug("[ENVIO DIRETO DE VIDEO EM CACHE]");
            finalMedia = inputMedia;
        } else if (buffer) {
            const filename = `video_${Date.now()}.${meta.ext}`;
            const uploadedFile = await this.uploadFromBuffer(
                client,
                filename,
                buffer,
            );

            const uploadedMedia = this.buildInputMedia(
                uploadedFile,
                meta,
                filename,
                true,
            );

            const serverMedia = await client.invoke(
                new Api.messages.UploadMedia({
                    peer,
                    media: uploadedMedia,
                }),
            );

            if (
                serverMedia instanceof Api.MessageMediaDocument &&
                serverMedia.document instanceof Api.Document
            ) {
                const d = serverMedia.document;
                await this.saveMediaCache(item.url, d);
                finalMedia = new Api.InputMediaDocument({
                    id: new Api.InputDocument({
                        id: d.id,
                        accessHash: d.accessHash,
                        fileReference: d.fileReference,
                    }),
                });
            } else {
                throw new Error(
                    "Falha ao registrar vídeo no Telegram para cache",
                );
            }
        } else {
            return;
        }

        // Envio final
        await client.invoke(
            new Api.messages.SendMedia({
                peer,
                media: finalMedia,
                message: "",
                randomId: this.mtproto.makeRandomId(),
            }),
        );
    }

    async sendVoiceBotApi(
        token: string,
        chatId: string,
        base: Record<string, any>,
        item: MediaItem,
    ): Promise<void> {
        this.logger.debug(
            `[sendVoiceBotApi] Enviando áudio para ${chatId}: ${item.url}`,
        );

        const FormData = require("form-data");
        const form = new FormData();

        form.append("chat_id", chatId);
        if (base.business_connection_id) {
            form.append("business_connection_id", base.business_connection_id);
        }

        try {
            if (item.fileId) {
                // Se já tem o fileId, o envio é instantâneo
                form.append("voice", item.fileId);
            } else {
                // Se é arquivo local/novo, lê o buffer do disco
                const audioBuffer = await this.fetchFileBuffer(item.url);

                // O Telegram identifica como voz se o nome terminar em .ogg ou .mp3
                form.append("voice", audioBuffer, {
                    filename: "voice.ogg",
                    contentType: "audio/ogg",
                });
            }

            const { data } = await axios.post(
                `https://api.telegram.org/bot${token}/sendVoice`,
                form,
                {
                    headers: form.getHeaders(),
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                },
            );

            // Salva o file_id para não precisar fazer upload na próxima vez
            if (data.ok && data.result?.voice?.file_id && item.itemId) {
                await this.saveFileId(
                    item.itemId,
                    true,
                    data.result.voice.file_id,
                );
            }
        } catch (err: any) {
            this.logger.error(
                `[sendVoiceBotApi] Erro ao enviar voz: ${err.response?.data?.description || err.message}`,
            );
            throw err;
        }
    }

    // ── File ID cache ─────────────────────────────────────────────────────

    async saveFileId(
        itemId: string,
        isTemplateMedia: boolean,
        fileId: string,
    ): Promise<void> {
        try {
            if (isTemplateMedia) {
                // Usamos updateMany porque ele não lança erro se o ID não existir,
                // apenas retorna count: 0
                await this.prisma.messageTemplateMedia.updateMany({
                    where: { id: itemId },
                    data: { telegramFileId: fileId },
                });

                this.logger.debug(
                    `[saveFileId] ID do Telegram salvo para a mídia: ${itemId}`,
                );
            } else {
                // Se você tiver outra lógica para mídias que não são de template
                await this.prisma.mediaCache.updateMany({
                    where: { id: itemId },
                    data: { telegramDocId: fileId },
                });
            }
        } catch (err: any) {
            this.logger.warn(
                `[saveFileId] Não foi possível atualizar o file_id para ${itemId}. O registro pode ter sido removido.`,
            );
        }
    }

    // ── PIX Audio ─────────────────────────────────────────────────────────

    async sendPixAudio(botId: string, chatId: string | number): Promise<void> {
        const instructionsAudio = await this.prisma.pixAudioConfig.findFirst({
            where: { botId, isActive: true },
        });
        if (!instructionsAudio) return;

        const client = this.mtproto.getClient(botId);
        if (!client) return;

        const peer = await client.getInputEntity(String(chatId));

        // ✅ AÇÃO: Gravando áudio via MTProto
        await this.chatAction.sendActionMtproto(
            client,
            String(chatId),
            "record_voice",
            2500,
        );

        const audioBuffer = await this.fetchFileBuffer(
            instructionsAudio.audioUrl,
            true,
        );
        const duration = await this.getAudioDuration(audioBuffer);
        const uploadedFile = await this.uploadFromBuffer(
            client,
            `voice_${Date.now()}.ogg`,
            audioBuffer,
        );

        const voiceMedia = new Api.InputMediaUploadedDocument({
            file: uploadedFile,
            mimeType: "audio/ogg",
            attributes: [
                new Api.DocumentAttributeAudio({ duration, voice: true }),
            ],
        });

        await client.invoke(
            new Api.messages.SendMedia({
                peer,
                media: voiceMedia,
                message: "",
                randomId: this.mtproto.makeRandomId(),
            }),
        );
    }
}
