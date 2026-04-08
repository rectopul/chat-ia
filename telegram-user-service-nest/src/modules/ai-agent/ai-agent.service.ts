import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import {
    BotAccount,
    ChatMessageType,
    ChatMessageRole,
    MediaType,
    MessageDirection,
    MessageTemplate,
    MessageTemplateMedia,
    Product,
} from "@prisma/client";
import {
    GenerationConfig,
    GoogleGenerativeAI,
    ResponseSchema,
    SchemaType,
} from "@google/generative-ai";
import { Queue } from "bullmq";
import { DeliveryOrderService } from "../delivery/delivery-order.service";
import {
    ProductSearchResult,
    ProductService,
} from "../delivery/product.service";
import {
    TemporaryCart,
    TemporaryCartItem,
    TemporaryCartService,
} from "../delivery/temporary-cart.service";
import { AiAgentRepository } from "./ai-agent.repository";
import { SubscriptionService } from "../subscription/subscription.service";

export const AI_RESPONSE_QUEUE_NAME = "ai-response";
export const AI_RESPONSE_JOB_NAME = "generate-ai-response";

const AI_MODEL_NAME = "gemini-2.5-flash";
const WHATSAPP_GROCERY_MODEL_NAME = "gemini-2.5-flash";
const WHATSAPP_AUDIO_TRANSCRIPTION_MODEL_NAME = "gemini-2.5-flash";
const AI_SYSTEM_PROMPT = [
    "Your name is Clara.",
    "Answer in Brazilian Portuguese.",
    "You are a sales assistant and the face of a premium creator profile.",
    "Use a warm, confident, seductive, playful tone, but avoid graphic or explicit sexual descriptions.",
    "Your goal is to convert the conversation into interest in the available plans and previews.",
    "Only mention products and previews that exist in the runtime catalog provided to you.",
    "Never invent prices, plan names, benefits, files, or promises that are not in the catalog.",
    "If the user asks for plans, prices, packs, access, or options, clearly list the available plans from the catalog.",
    "If the user clearly chooses one available plan or asks for PIX for a specific plan, confirm warmly and say you are sending the PIX copy-and-paste now.",
    "If the user asks for a preview, sample, photo, video, audio, or to see more, you may mention that you are sending a preview when one is available.",
    "Keep answers short, engaging, and sales-oriented.",
].join(" ");

const GROCERY_SYSTEM_PROMPT = [
    "You are a grocery store attendant for a neighborhood shop in Brazil.",
    "Answer in Brazilian Portuguese.",
    "Be cordial, brief, practical, and helpful.",
    "Always confirm quantities when the customer asks for products.",
    "Never invent products, prices, availability, stock levels, or categories.",
    "Use only the products and IDs provided in the runtime catalog.",
    "If the quantity is unclear, do not update the cart and ask a short follow-up question asking for the quantity.",
    "When the quantity is clear, prepare cart operations using only valid product IDs.",
    "If it feels natural, suggest one or two related products from the related suggestions list.",
    "Return only valid JSON with replyText, cartOperations, and suggestedProductIds.",
].join(" ");

const GROCERY_RESPONSE_SCHEMA: ResponseSchema = {
    type: SchemaType.OBJECT,
    required: ["replyText", "cartOperations", "suggestedProductIds"],
    properties: {
        replyText: {
            type: SchemaType.STRING,
            description:
                "Short reply in Brazilian Portuguese to be sent to the customer.",
        },
        cartOperations: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                required: ["productId", "quantity", "mode"],
                properties: {
                    productId: {
                        type: SchemaType.STRING,
                        description: "Valid product ID from the provided catalog.",
                    },
                    quantity: {
                        type: SchemaType.INTEGER,
                        description: "Positive integer quantity requested by the customer.",
                    },
                    mode: {
                        type: SchemaType.STRING,
                        enum: ["set", "add"],
                        description: "Use set for replacement and add for incremental additions.",
                    },
                },
            },
        },
        suggestedProductIds: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.STRING,
            },
        },
    },
};

const GROCERY_JSON_GENERATION_CONFIG: GenerationConfig = {
    responseMimeType: "application/json",
    responseSchema: GROCERY_RESPONSE_SCHEMA,
    temperature: 0.2,
};

const GROCERY_RELATED_PRODUCT_RULES = [
    {
        triggers: ["carvao", "carvão"],
        suggestions: ["carne", "picanha", "frango", "linguica", "linguiça", "sal grosso"],
    },
    {
        triggers: ["carne", "picanha", "frango", "linguica", "linguiça"],
        suggestions: ["carvao", "carvão", "sal grosso", "cerveja", "refrigerante"],
    },
    {
        triggers: ["arroz"],
        suggestions: ["feijao", "feijão", "oleo", "óleo", "alho"],
    },
    {
        triggers: ["macarrao", "macarrão", "massa", "espaguete"],
        suggestions: ["molho", "queijo", "queijo ralado"],
    },
    {
        triggers: ["pao", "pão"],
        suggestions: ["manteiga", "queijo", "presunto", "requeijao", "requeijão"],
    },
    {
        triggers: ["cafe", "café"],
        suggestions: ["acucar", "açúcar", "leite", "biscoito"],
    },
    {
        triggers: ["refrigerante", "cerveja", "suco"],
        suggestions: ["gelo", "salgadinho", "carvao", "carvão"],
    },
].map((rule) => ({
    triggers: rule.triggers.map((term) => term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()),
    suggestions: rule.suggestions.map((term) => term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()),
}));

const PREVIEW_TAG_SYNONYM_GROUPS = [
    ["banho", "chuveiro", "banheira", "espuma", "molhada", "toalha"],
    ["quarto", "cama", "lencol", "travesseiro", "coberta"],
    ["espelho", "selfie", "reflexo"],
    ["cozinha", "fogao", "pia", "avental"],
    ["piscina", "praia", "agua", "biquini", "verao"],
    ["lingerie", "calcinha", "sutia", "camisola"],
    ["salto", "sapato", "sandalia"],
    ["close", "rosto", "boca", "olhar"],
].map((group) => group.map((term) => term.toLowerCase()));

export type AiResponseTransport = "business" | "mtproto";

export interface AiResponseJobData {
    transport: AiResponseTransport;
    botId: string;
    telegramId: string;
    chatId: string;
    messageText: string;
    telegramMessageId?: string;
    token?: string;
    businessConnectionId?: string;
}

type GeminiRole = "user" | "model";

export interface AiAgentReply {
    text: string;
    previewTemplateIds: string[];
    productIdToCharge?: string;
    usage?: AiUsageSnapshot | null;
}

export type AiUsageSnapshot = {
    modelName: string | null;
    promptTokenCount: number | null;
    candidatesTokenCount: number | null;
    totalTokenCount: number | null;
};

export interface AiDontSellRequest {
    botId: string;
    telegramId: string;
    leadFirstName?: string | null;
    anchorTemplateText?: string | null;
}

export interface WhatsappAiRequest {
    instanceId: string;
    chatId: string;
    ownerUserId: string;
    personaName: string;
    messageText?: string;
    mediaUrl?: string | null;
    messageType?: ChatMessageType;
}

type PreviewTemplate = MessageTemplate & {
    mediaItems: MessageTemplateMedia[];
};

type GroceryCartOperation = {
    productId: string;
    quantity: number;
    mode?: "set" | "add";
};

type GroceryAiStructuredResponse = {
    replyText?: string;
    cartOperations?: GroceryCartOperation[];
    suggestedProductIds?: string[];
    usage?: AiUsageSnapshot | null;
};

type WhatsappResolvedInput = {
    messageText: string;
    originalMessageType: ChatMessageType;
    mediaUrl?: string | null;
    usage?: AiUsageSnapshot | null;
};

type AppliedCartOperation = {
    productId: string;
    title: string;
    quantity: number;
};

@Injectable()
export class AiAgentService {
    private readonly logger = new Logger(AiAgentService.name);
    private genAI?: GoogleGenerativeAI;

    constructor(
        private readonly configService: ConfigService,
        private readonly repository: AiAgentRepository,
        private readonly subscriptionService: SubscriptionService,
        private readonly productService: ProductService,
        private readonly temporaryCartService: TemporaryCartService,
        private readonly deliveryOrderService: DeliveryOrderService,
        @InjectQueue(AI_RESPONSE_QUEUE_NAME)
        private readonly aiResponseQueue: Queue<AiResponseJobData>,
    ) {}

    async enqueueIncomingMessage(data: AiResponseJobData): Promise<void> {
        const messageText = data.messageText.trim();

        if (!messageText) {
            return;
        }

        await this.subscriptionService.assertAiAccess(data.botId);

        await this.repository.createMessage({
            botId: data.botId,
            telegramId: data.telegramId,
            role: ChatMessageRole.user,
            content: messageText,
        });

        await this.aiResponseQueue.add(
            AI_RESPONSE_JOB_NAME,
            {
                ...data,
                messageText,
            },
            {
                jobId: data.telegramMessageId
                    ? this.buildJobId(data)
                    : undefined,
                attempts: 5,
                backoff: {
                    type: "exponential",
                    delay: 5000,
                },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 100 },
            },
        );
    }

    private buildJobId(data: AiResponseJobData): string {
        const safeParts = [
            AI_RESPONSE_JOB_NAME,
            data.transport,
            data.botId,
            data.telegramMessageId ?? "",
        ].map((part) => part.replace(/[:\s]/g, "_"));

        return safeParts.join("__");
    }

    async generateResponse(data: AiResponseJobData): Promise<AiAgentReply> {
        const telegramId = data.telegramId;
        const [history, products, previewTemplates, botAccount, recentPreviewMediaUrls] =
            await Promise.all([
                this.repository.getRecentMessages(data.botId, telegramId, 10),
                this.repository.getActiveProductsForBot(data.botId),
                this.repository.getActivePreviewTemplatesForBot(data.botId),
                this.repository.getBotAccount(data.botId),
                this.repository.getRecentlySentPreviewMediaUrls(
                    data.botId,
                    data.chatId,
                ),
            ]);

        if (!history.length) {
            throw new Error(
                `No chat history available for telegramId=${telegramId}`,
            );
        }

        const personaName = this.getPersonaName(botAccount);
        const modelName = this.getModelName();
        const model = this.getModel(personaName);
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: this.buildRuntimeContext(
                                personaName,
                                products,
                                previewTemplates,
                            ),
                        },
                    ],
                },
                ...history.map((message) => ({
                    role: message.role as GeminiRole,
                    parts: [{ text: message.content }],
                })),
            ],
        });

        const responseText = result.response.text().trim();

        if (!responseText) {
            throw new Error("Gemini returned an empty response");
        }

        this.logger.debug(
            `[generateResponse] telegramId=${telegramId} history=${history.length} model=${this.getModelName()}`,
        );

        return {
            text: responseText,
            previewTemplateIds: this.selectPreviewTemplateIds(
                data.messageText,
                previewTemplates,
                recentPreviewMediaUrls,
            ),
            productIdToCharge: this.selectProductIdForCharge(
                data.messageText,
                products,
            ),
            usage: this.extractUsageSnapshot(
                modelName,
                result.response.usageMetadata,
            ),
        };
    }

    async generateDontSellResponse(
        data: AiDontSellRequest,
    ): Promise<AiAgentReply> {
        const [history, products, previewTemplates, botAccount, recentPreviewMediaUrls] =
            await Promise.all([
                this.repository.getRecentMessages(
                    data.botId,
                    data.telegramId,
                    10,
                ),
                this.repository.getActiveProductsForBot(data.botId),
                this.repository.getActivePreviewTemplatesForBot(data.botId),
                this.repository.getBotAccount(data.botId),
                this.repository.getRecentlySentPreviewMediaUrls(
                    data.botId,
                    data.telegramId,
                ),
            ]);

        const personaName = this.getPersonaName(botAccount);
        const modelName = this.getModelName();
        const model = this.getModel(personaName);
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: this.buildRuntimeContext(
                                personaName,
                                products,
                                previewTemplates,
                            ),
                        },
                        {
                            text: this.buildDontSellInstruction(data, history),
                        },
                    ],
                },
                ...history.map((message) => ({
                    role: message.role as GeminiRole,
                    parts: [{ text: message.content }],
                })),
            ],
        });

        const responseText = result.response.text().trim();

        if (!responseText) {
            throw new Error("Gemini returned an empty dont sell response");
        }

        const signalText = history
            .filter((message) => message.role === ChatMessageRole.user)
            .map((message) => message.content)
            .join(" ");

        this.logger.debug(
            `[generateDontSellResponse] telegramId=${data.telegramId} history=${history.length} model=${this.getModelName()}`,
        );

        return {
            text: responseText,
            previewTemplateIds: this.selectPreviewTemplateIds(
                signalText,
                previewTemplates,
                recentPreviewMediaUrls,
            ),
            usage: this.extractUsageSnapshot(
                modelName,
                result.response.usageMetadata,
            ),
        };
    }

    async generateWhatsappResponse(
        data: WhatsappAiRequest,
    ): Promise<AiAgentReply> {
        const resolvedInput = await this.resolveWhatsappInput(data);
        const messageText = resolvedInput.messageText;

        const conversationKey = this.buildWhatsappConversationKey(
            data.instanceId,
            data.chatId,
        );

        await this.repository.createMessage({
            botId: null,
            telegramId: conversationKey,
            role: ChatMessageRole.user,
            content: messageText,
            mediaUrl: resolvedInput.mediaUrl ?? null,
            messageType: resolvedInput.originalMessageType,
            aiModel: resolvedInput.usage?.modelName ?? null,
            promptTokenCount: resolvedInput.usage?.promptTokenCount ?? null,
            candidatesTokenCount:
                resolvedInput.usage?.candidatesTokenCount ?? null,
            totalTokenCount: resolvedInput.usage?.totalTokenCount ?? null,
        });

        const [history, products, previewTemplates, currentCart, matchedProducts] =
            await Promise.all([
            this.repository.getConversationMessages(conversationKey, 10),
            this.repository.getActiveDeliveryProductsForOwner(
                data.ownerUserId,
            ),
            this.repository.getActivePreviewTemplatesForOwner(data.ownerUserId),
                this.temporaryCartService.getCart(data.chatId),
                this.productService.searchProducts({
                    instanceId: data.instanceId,
                    ownerUserId: data.ownerUserId,
                    query: messageText,
                    onlyAvailable: false,
                    limit: 12,
                }),
            ]);

        const relatedProducts = this.selectRelatedProducts(
            products,
            this.resolveMentionedProducts(products, matchedProducts),
            currentCart,
        );

        if (
            currentCart.items.length > 0 &&
            this.isSimpleCartConfirmationIntent(messageText)
        ) {
            const finalizedOrder = await this.maybeFinalizeWhatsappOrder({
                messageText,
                instanceId: data.instanceId,
                chatId: data.chatId,
                cart: currentCart,
            });

            if (finalizedOrder) {
                await this.temporaryCartService.clearCart(data.chatId);

                return {
                    text: this.buildOrderFinalizedReplyText(currentCart),
                    previewTemplateIds: [],
                    usage: null,
                };
            }

            return {
                text: this.buildCartConfirmedReplyText(currentCart),
                previewTemplateIds: [],
                usage: null,
            };
        }

        const structuredReply = await this.generateWhatsappGroceryReply({
            personaName: data.personaName,
            history,
            catalogProducts: products,
            matchedProducts,
            currentCart,
            relatedProducts,
        });
        let cartUpdateResult = {
            cart: currentCart,
            appliedOperations: [] as AppliedCartOperation[],
        };

        try {
            cartUpdateResult = await this.updateCart(
                data.chatId,
                data.instanceId,
                data.ownerUserId,
                structuredReply.cartOperations ?? [],
                messageText,
            );
        } catch (error) {
            this.logger.warn(
                `[generateWhatsappResponse] falha ao atualizar carrinho instanceId=${data.instanceId} chatId=${data.chatId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );

            return {
                text: this.buildCartUpdateFailureReply(error),
                previewTemplateIds: [],
                usage: structuredReply.usage ?? null,
            };
        }

        const finalizedOrder = await this.maybeFinalizeWhatsappOrder({
            messageText,
            instanceId: data.instanceId,
            chatId: data.chatId,
            cart: cartUpdateResult.cart,
        });

        if (finalizedOrder) {
            await this.temporaryCartService.clearCart(data.chatId);
        }

        const responseText = finalizedOrder
            ? this.buildOrderFinalizedReplyText(cartUpdateResult.cart)
            : this.buildWhatsappReplyText({
            fallbackReplyText: structuredReply.replyText,
            appliedOperations: cartUpdateResult.appliedOperations,
            cart: cartUpdateResult.cart,
            relatedProducts: this.selectRelatedProducts(
                products,
                this.resolveMentionedProducts(products, matchedProducts),
                cartUpdateResult.cart,
                structuredReply.suggestedProductIds,
            ),
        });

        this.logger.debug(
            `[generateWhatsappResponse] instanceId=${data.instanceId} chatId=${data.chatId} history=${history.length} model=${this.getModelName()}`,
        );

        return {
            text: responseText,
            previewTemplateIds: this.selectPreviewTemplateIds(
                messageText,
                previewTemplates,
            ),
            usage: structuredReply.usage ?? null,
        };
    }

    async saveModelMessage(
        botId: string,
        telegramId: string,
        content: string,
        usage?: AiUsageSnapshot | null,
    ): Promise<void> {
        const trimmedContent = content.trim();

        if (!trimmedContent) {
            return;
        }

        await this.repository.createMessage({
            botId,
            telegramId,
            role: ChatMessageRole.model,
            content: trimmedContent,
            aiModel: usage?.modelName ?? null,
            promptTokenCount: usage?.promptTokenCount ?? null,
            candidatesTokenCount: usage?.candidatesTokenCount ?? null,
            totalTokenCount: usage?.totalTokenCount ?? null,
        });
    }

    async saveWhatsappModelMessage(
        instanceId: string,
        chatId: string,
        content: string,
        messageType: ChatMessageType = ChatMessageType.TEXT,
        mediaUrl?: string | null,
        usage?: AiUsageSnapshot | null,
    ): Promise<void> {
        const trimmedContent = content.trim();

        if (!trimmedContent) {
            return;
        }

        await this.repository.createMessage({
            botId: null,
            telegramId: this.buildWhatsappConversationKey(instanceId, chatId),
            role: ChatMessageRole.model,
            content: trimmedContent,
            mediaUrl: mediaUrl ?? null,
            messageType,
            aiModel: usage?.modelName ?? null,
            promptTokenCount: usage?.promptTokenCount ?? null,
            candidatesTokenCount: usage?.candidatesTokenCount ?? null,
            totalTokenCount: usage?.totalTokenCount ?? null,
        });
    }

    async getTemplatesByIds(ids: string[]) {
        return this.repository.getTemplatesByIds(ids);
    }

    async savePreviewDeliveryLog(
        botId: string,
        chatId: string,
        template: PreviewTemplate,
    ): Promise<void> {
        const user = await this.repository.getTelegramUserByChatId(chatId);
        if (!user) {
            return;
        }

        const logs = this.buildPreviewMessageLogs(
            botId,
            user.telegramUserId,
            template,
        );
        await this.repository.createMessageLogs(logs);
    }

    private async resolveWhatsappInput(
        data: WhatsappAiRequest,
    ): Promise<WhatsappResolvedInput> {
        if (data.messageType === ChatMessageType.AUDIO && data.mediaUrl) {
            const transcription = await this.transcribeWhatsappAudio(
                data.mediaUrl,
            );
            return {
                messageText: transcription.transcript,
                originalMessageType: ChatMessageType.AUDIO,
                mediaUrl: data.mediaUrl,
                usage: transcription.usage,
            };
        }

        const directText = data.messageText?.trim();

        if (!directText) {
            throw new Error("WhatsApp message text is empty");
        }

        return {
            messageText: directText,
            originalMessageType: data.messageType ?? ChatMessageType.TEXT,
            mediaUrl: data.mediaUrl ?? null,
            usage: null,
        };
    }

    private async transcribeWhatsappAudio(mediaUrl: string): Promise<{
        transcript: string;
        usage: AiUsageSnapshot | null;
    }> {
        const audio = await this.fetchRemoteBinary(mediaUrl);
        const modelName = this.getTranscriptionModelName();
        const model = this.getTranscriptionModel();
        const result = await model.generateContent([
            "Transcreva este audio em portugues do Brasil. Responda apenas com a transcricao limpa, sem aspas, sem comentarios e sem formatacao extra.",
            {
                inlineData: {
                    data: audio.buffer.toString("base64"),
                    mimeType: audio.mimeType,
                },
            },
        ]);
        const transcript = result.response.text().trim();

        if (!transcript) {
            throw new Error("Gemini returned an empty audio transcription");
        }

        return {
            transcript,
            usage: this.extractUsageSnapshot(
                modelName,
                result.response.usageMetadata,
            ),
        };
    }

    private async fetchRemoteBinary(
        mediaUrl: string,
    ): Promise<{ buffer: Buffer; mimeType: string }> {
        const response = await axios.get<ArrayBuffer>(mediaUrl, {
            responseType: "arraybuffer",
            timeout: Number(
                this.configService.get("WHATSAPP_MEDIA_DOWNLOAD_TIMEOUT_MS") ??
                    15_000,
            ),
        });
        const headerContentType = response.headers["content-type"];
        const mimeType =
            this.normalizeRemoteMimeType(headerContentType) ??
            this.inferMimeTypeFromUrl(mediaUrl) ??
            "audio/ogg";

        return {
            buffer: Buffer.from(response.data),
            mimeType,
        };
    }

    private async generateWhatsappGroceryReply(input: {
        personaName: string;
        history: Array<{
            role: ChatMessageRole;
            content: string;
        }>;
        catalogProducts: Product[];
        matchedProducts: ProductSearchResult[];
        currentCart: TemporaryCart;
        relatedProducts: Product[];
    }): Promise<GroceryAiStructuredResponse> {
        const modelName = this.getWhatsappModelName();
        const model = this.getWhatsappModel(
            input.personaName,
            GROCERY_JSON_GENERATION_CONFIG,
        );
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: this.buildWhatsappGroceryRuntimeContext(input),
                        },
                    ],
                },
                ...input.history.map((message) => ({
                    role: message.role as GeminiRole,
                    parts: [{ text: message.content }],
                })),
            ],
        });
        const rawText = result.response.text().trim();

        if (!rawText) {
            throw new Error("Gemini returned an empty WhatsApp grocery response");
        }

        return {
            ...this.normalizeStructuredGroceryReply(rawText),
            usage: this.extractUsageSnapshot(
                modelName,
                result.response.usageMetadata,
            ),
        };
    }

    private buildWhatsappGroceryRuntimeContext(input: {
        personaName: string;
        catalogProducts: Product[];
        matchedProducts: ProductSearchResult[];
        currentCart: TemporaryCart;
        relatedProducts: Product[];
    }): string {
        const catalogLines = input.catalogProducts.length
            ? input.catalogProducts
                  .slice(0, 80)
                  .map((product) => this.buildCatalogLine(product))
                  .join("\n")
            : "- Nenhum produto ativo no catalogo.";
        const matchedProductLines = input.matchedProducts.length
            ? input.matchedProducts
                  .map((product) => this.buildSearchResultLine(product))
                  .join("\n")
            : "- Nenhum produto diretamente relacionado a ultima mensagem.";
        const relatedProductLines = input.relatedProducts.length
            ? input.relatedProducts
                  .map((product) => this.buildCatalogLine(product))
                  .join("\n")
            : "- Nenhuma sugestao relacionada no momento.";

        return [
            "CONTEXTO_MERCEARIA",
            `Nome da loja ou atendente: ${input.personaName}`,
            "",
            "Carrinho temporario atual do cliente:",
            this.buildCartContext(input.currentCart),
            "",
            "Produtos mais relacionados a ultima mensagem do cliente:",
            matchedProductLines,
            "",
            "Catalogo atual:",
            catalogLines,
            "",
            "Sugestoes relacionadas que podem ser oferecidas se fizer sentido:",
            relatedProductLines,
            "",
            "FORMATO_DE_SAIDA_OBRIGATORIO",
            '{"replyText":"...", "cartOperations":[{"productId":"...", "quantity":2, "mode":"set"}], "suggestedProductIds":["..."]}',
            "",
            "REGRAS",
            "- Responda somente com JSON valido.",
            "- replyText deve ser cordial, curto e objetivo.",
            "- Sempre confirme quantidades quando o cliente pedir itens.",
            "- Se a quantidade estiver clara, preencha cartOperations com IDs reais do catalogo.",
            "- Se a quantidade nao estiver clara, deixe cartOperations vazio e pergunte quantas unidades.",
            "- Se o carrinho ja tiver itens e o cliente pedir um novo produto, mantenha os itens anteriores e adicione somente o novo item pedido.",
            "- Se o cliente pedir mais de um item, voce pode enviar varias operacoes.",
            "- Se o cliente disser 'mais', prefira mode='add'. Caso contrario, use mode='set'.",
            "- Se o cliente responder apenas com confirmacoes curtas como 'sim', 'correto' ou 'isso mesmo', nao repita a mesma pergunta de quantidade.",
            "- suggestedProductIds deve usar somente IDs reais do catalogo relacionado. Se nao fizer sentido, envie [].",
        ].join("\n");
    }

    private async updateCart(
        whatsappId: string,
        instanceId: string,
        ownerUserId: string,
        operations: GroceryCartOperation[],
        sourceMessageText: string,
    ): Promise<{
        cart: TemporaryCart;
        appliedOperations: AppliedCartOperation[];
    }> {
        let cart = await this.temporaryCartService.getCart(whatsappId);
        const appliedOperations: AppliedCartOperation[] = [];

        for (const operation of this.normalizeCartOperations(operations)) {
            const existingItem = cart.items.find(
                (item) => item.productId === operation.productId,
            );
            const operationMode = this.resolveCartOperationMode(
                operation,
                existingItem,
                sourceMessageText,
            );

            if (operationMode === "add" || !existingItem) {
                cart = await this.temporaryCartService.addProduct(whatsappId, {
                    productId: operation.productId,
                    quantity: operation.quantity,
                    instanceId,
                    ownerUserId,
                });
            } else {
                cart = await this.temporaryCartService.setItemQuantity(
                    whatsappId,
                    operation.productId,
                    operation.quantity,
                    {
                        instanceId,
                        ownerUserId,
                    },
                );
            }

            const updatedItem = cart.items.find(
                (item) => item.productId === operation.productId,
            );

            if (updatedItem) {
                appliedOperations.push({
                    productId: updatedItem.productId,
                    title: updatedItem.title,
                    quantity: updatedItem.quantity,
                });
            }
        }

        if (cart.deliveryAddress?.trim()) {
            await this.deliveryOrderService.syncPendingOrderFromCart({
                ownerUserId,
                instanceId,
                whatsappId,
                deliveryAddress: cart.deliveryAddress,
            });
        }

        return { cart, appliedOperations };
    }

    private buildWhatsappReplyText(input: {
        fallbackReplyText?: string;
        appliedOperations: AppliedCartOperation[];
        cart: TemporaryCart;
        relatedProducts: Product[];
    }): string {
        if (input.appliedOperations.length > 0) {
            const confirmation = this.buildCartConfirmationText(
                input.appliedOperations,
                input.cart,
            );
            const suggestion = input.relatedProducts.length
                ? ` Se quiser, também posso incluir ${this.joinHumanList(
                      input.relatedProducts.map((product) => product.title),
                  )}.`
                : "";

            return `${confirmation}${suggestion}`.trim();
        }

        const fallback =
            input.fallbackReplyText?.trim() ||
            "Claro! Me diga o produto e a quantidade que eu separo pra voce.";

        return fallback;
    }

    private buildCartConfirmationText(
        operations: AppliedCartOperation[],
        cart: TemporaryCart,
    ): string {
        const appliedSummary = this.joinHumanList(
            operations.map(
                (operation) => `${operation.quantity}x ${operation.title}`,
            ),
        );
        const cartSummary = this.buildCartItemsSummary(cart);

        if (
            cart.items.length > operations.length ||
            cart.items.some(
                (item) =>
                    !operations.some(
                        (operation) => operation.productId === item.productId,
                    ),
            )
        ) {
            return `Perfeito! Adicionei ${appliedSummary}. Seu carrinho agora está com ${cartSummary}. Confirma pra mim se as quantidades estão certas?`;
        }

        return `Perfeito! Separei ${appliedSummary}. Confirma pra mim se as quantidades estão certas?`;
    }

    private buildCartConfirmedReplyText(cart: TemporaryCart): string {
        const cartSummary = this.buildCartItemsSummary(cart);
        const totalText = this.formatPrice(cart.totalCents);

        if (cart.deliveryAddress?.trim()) {
            return `Perfeito! Seu carrinho está com ${cartSummary}. Total parcial: ${totalText}. Entrega em ${cart.deliveryAddress}. Se estiver tudo certo, posso finalizar o pedido.`;
        }

        return `Perfeito! Seu carrinho está com ${cartSummary}. Total parcial: ${totalText}. Se quiser, posso adicionar mais itens ou você pode me mandar o endereço para entrega.`;
    }

    private buildCartUpdateFailureReply(error: unknown): string {
        const message =
            error instanceof Error ? error.message.trim() : String(error).trim();

        if (!message) {
            return "Tive um probleminha para atualizar o carrinho agora. Pode me mandar o item e a quantidade de novo, por favor?";
        }

        return `${message}. Se quiser, me manda o item e a quantidade novamente que eu confiro pra voce.`;
    }

    private async maybeFinalizeWhatsappOrder(input: {
        messageText: string;
        instanceId: string;
        chatId: string;
        cart: TemporaryCart;
    }) {
        if (!input.cart.items.length || !input.cart.deliveryAddress?.trim()) {
            return null;
        }

        if (!this.isWhatsappOrderConfirmationIntent(input.messageText)) {
            return null;
        }

        return this.deliveryOrderService.finalizePendingOrder({
            instanceId: input.instanceId,
            whatsappId: input.chatId,
        });
    }

    private buildOrderFinalizedReplyText(cart: TemporaryCart): string {
        const summary = this.joinHumanList(
            cart.items.map((item) => `${item.quantity}x ${item.title}`),
        );

        return `Pedido confirmado! Separei ${summary} para entrega em ${cart.deliveryAddress}. Assim que sair com o motoboy eu te aviso por aqui.`;
    }

    private normalizeCartOperations(
        operations: GroceryCartOperation[],
    ): GroceryCartOperation[] {
        return (operations ?? [])
            .map((operation) => ({
                productId: String(operation?.productId ?? "").trim(),
                quantity: Math.trunc(Number(operation?.quantity ?? 0)),
                mode: (operation?.mode === "add" ? "add" : "set") as
                    | "add"
                    | "set",
            }))
            .filter(
                (operation) =>
                    operation.productId.length > 0 && operation.quantity > 0,
            )
            .slice(0, 8);
    }

    private resolveCartOperationMode(
        operation: GroceryCartOperation,
        existingItem: TemporaryCartItem | undefined,
        sourceMessageText: string,
    ): "add" | "set" {
        if (!existingItem) {
            return "set";
        }

        if (operation.mode === "add") {
            return "add";
        }

        return this.isIncrementCartIntent(sourceMessageText) ? "add" : "set";
    }

    private selectRelatedProducts(
        catalogProducts: Product[],
        anchorProducts: Product[],
        currentCart: TemporaryCart,
        suggestedProductIds: string[] = [],
    ): Product[] {
        const relatedProducts: Product[] = [];
        const excludedIds = new Set<string>([
            ...anchorProducts.map((product) => product.id),
            ...currentCart.items.map((item) => item.productId),
        ]);
        const catalogById = new Map(
            catalogProducts.map((product) => [product.id, product]),
        );
        const pushProduct = (product?: Product | null) => {
            if (!product || excludedIds.has(product.id) || !product.isActive) {
                return;
            }

            if (
                product.stockQuantity !== null &&
                product.stockQuantity <= 0
            ) {
                return;
            }

            excludedIds.add(product.id);
            relatedProducts.push(product);
        };

        for (const productId of suggestedProductIds) {
            pushProduct(catalogById.get(productId));
        }

        const cartProducts = this.resolveCartProducts(catalogProducts, currentCart);
        const sourceProducts = [...anchorProducts, ...cartProducts];

        for (const sourceProduct of sourceProducts) {
            const normalizedSource = this.normalizeText(
                [
                    sourceProduct.title,
                    sourceProduct.description ?? "",
                    sourceProduct.category ?? "",
                ].join(" "),
            );

            for (const rule of GROCERY_RELATED_PRODUCT_RULES) {
                if (
                    !rule.triggers.some((trigger) =>
                        normalizedSource.includes(trigger),
                    )
                ) {
                    continue;
                }

                for (const keyword of rule.suggestions) {
                    const match = catalogProducts.find((product) => {
                        if (excludedIds.has(product.id) || !product.isActive) {
                            return false;
                        }

                        if (
                            product.stockQuantity !== null &&
                            product.stockQuantity <= 0
                        ) {
                            return false;
                        }

                        const searchableText = this.normalizeText(
                            [
                                product.title,
                                product.description ?? "",
                                product.category ?? "",
                            ].join(" "),
                        );

                        return searchableText.includes(keyword);
                    });

                    pushProduct(match);

                    if (relatedProducts.length >= 2) {
                        return relatedProducts;
                    }
                }
            }
        }

        return relatedProducts.slice(0, 2);
    }

    private resolveMentionedProducts(
        catalogProducts: Product[],
        matchedProducts: ProductSearchResult[],
    ): Product[] {
        const matchedIds = new Set(matchedProducts.map((product) => product.id));
        return catalogProducts.filter((product) => matchedIds.has(product.id));
    }

    private resolveCartProducts(
        catalogProducts: Product[],
        cart: TemporaryCart,
    ): Product[] {
        const cartIds = new Set(cart.items.map((item) => item.productId));
        return catalogProducts.filter((product) => cartIds.has(product.id));
    }

    private normalizeStructuredGroceryReply(
        rawText: string,
    ): GroceryAiStructuredResponse {
        try {
            const parsed = JSON.parse(this.extractJsonPayload(rawText)) as Record<
                string,
                unknown
            >;
            const replyText =
                typeof parsed.replyText === "string"
                    ? parsed.replyText.trim()
                    : rawText.trim();

            return {
                replyText,
                cartOperations: Array.isArray(parsed.cartOperations)
                    ? parsed.cartOperations
                          .map((operation) => operation as GroceryCartOperation)
                          .filter(Boolean)
                    : [],
                suggestedProductIds: Array.isArray(parsed.suggestedProductIds)
                    ? parsed.suggestedProductIds
                          .map((productId) => String(productId).trim())
                          .filter(Boolean)
                    : [],
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);

            if (message.includes("JSON object not found")) {
                this.logger.debug(
                    "[normalizeStructuredGroceryReply] modelo respondeu em texto livre; usando fallback textual",
                );
            } else {
                this.logger.warn(
                    `[normalizeStructuredGroceryReply] resposta nao estruturada, usando fallback textual: ${message}`,
                );
            }

            return {
                replyText: rawText.trim(),
                cartOperations: [],
                suggestedProductIds: [],
            };
        }
    }

    private extractJsonPayload(rawText: string): string {
        const trimmed = rawText.trim();
        const withoutFence = trimmed
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();

        if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) {
            return withoutFence;
        }

        const start = withoutFence.indexOf("{");
        if (start < 0) {
            throw new Error("JSON object not found in model response");
        }

        let depth = 0;
        let inString = false;
        let escaping = false;

        for (let index = start; index < withoutFence.length; index += 1) {
            const char = withoutFence[index];

            if (escaping) {
                escaping = false;
                continue;
            }

            if (char === "\\") {
                escaping = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (inString) {
                continue;
            }

            if (char === "{") {
                depth += 1;
            } else if (char === "}") {
                depth -= 1;

                if (depth === 0) {
                    return withoutFence.slice(start, index + 1);
                }
            }
        }

        throw new Error("Unterminated JSON object in model response");
    }

    private buildCatalogLine(product: Product): string {
        const stockText =
            product.stockQuantity === null
                ? "estoque: sob consulta"
                : product.stockQuantity > 0
                  ? `estoque: ${product.stockQuantity}`
                  : "estoque: indisponivel";
        const description = product.description?.trim()
            ? ` | descricao: ${product.description.trim()}`
            : "";
        const category = product.category?.trim()
            ? ` | categoria: ${product.category.trim()}`
            : "";

        return `- id: ${product.id} | nome: ${product.title} | preco: ${this.formatPrice(product.priceCents)} | ${stockText}${category}${description}`;
    }

    private buildSearchResultLine(product: ProductSearchResult): string {
        const stockText =
            product.stockQuantity === null
                ? "estoque: sob consulta"
                : product.isAvailable
                  ? `estoque: ${product.stockQuantity}`
                  : "estoque: indisponivel";
        const category = product.category?.trim()
            ? ` | categoria: ${product.category.trim()}`
            : "";
        const description = product.description?.trim()
            ? ` | descricao: ${product.description.trim()}`
            : "";

        return `- id: ${product.id} | nome: ${product.title} | preco: ${this.formatPrice(product.priceCents)} | ${stockText}${category}${description}`;
    }

    private buildCartContext(cart: TemporaryCart): string {
        if (!cart.items.length) {
            return "- Carrinho vazio.";
        }

        return [
            ...cart.items.map((item) => this.buildCartItemLine(item)),
            `- Total parcial: ${this.formatPrice(cart.totalCents)}`,
            cart.deliveryAddress
                ? `- Endereco de entrega: ${cart.deliveryAddress}`
                : "- Endereco de entrega: nao informado",
        ].join("\n");
    }

    private buildCartItemLine(item: TemporaryCartItem): string {
        return `- ${item.quantity}x ${item.title} | subtotal: ${this.formatPrice(item.subtotalCents)}`;
    }

    private buildCartItemsSummary(cart: TemporaryCart): string {
        if (!cart.items.length) {
            return "carrinho vazio";
        }

        return this.joinHumanList(
            cart.items.map((item) => `${item.quantity}x ${item.title}`),
        );
    }

    private joinHumanList(values: string[]): string {
        const filtered = values
            .map((value) => value.trim())
            .filter(Boolean);

        if (!filtered.length) {
            return "";
        }

        if (filtered.length === 1) {
            return filtered[0];
        }

        if (filtered.length === 2) {
            return `${filtered[0]} e ${filtered[1]}`;
        }

        return `${filtered.slice(0, -1).join(", ")} e ${filtered[filtered.length - 1]}`;
    }

    private formatPrice(valueCents: number): string {
        return `R$ ${(valueCents / 100).toFixed(2).replace(".", ",")}`;
    }

    private isWhatsappOrderConfirmationIntent(messageText: string): boolean {
        const normalized = this.normalizeText(messageText);

        return [
            "pode fechar",
            "fechar pedido",
            "fecha meu pedido",
            "pode finalizar",
            "finaliza",
            "pedido confirmado",
            "confirmo",
            "isso mesmo",
            "ta certo",
            "esta certo",
            "fechado",
            "pode mandar",
            "pode entregar",
        ].some((keyword) => normalized.includes(keyword));
    }

    private isSimpleCartConfirmationIntent(messageText: string): boolean {
        const normalized = this.normalizeText(messageText)
            .replace(/[!?.,]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (!normalized || normalized.length > 24) {
            return false;
        }

        return [
            "sim",
            "sim correto",
            "sim certinho",
            "sim isso mesmo",
            "correto",
            "isso mesmo",
            "ta certo",
            "esta certo",
            "certo",
            "ok",
            "perfeito",
            "confirmo",
        ].includes(normalized);
    }

    private isIncrementCartIntent(messageText: string): boolean {
        const normalized = this.normalizeText(messageText);

        return [
            "mais",
            "tambem",
            "também",
            "outra",
            "outro",
            "acrescenta",
            "adiciona",
            "coloca mais",
            "leva mais",
        ].some((keyword) => normalized.includes(keyword));
    }

    private normalizeRemoteMimeType(value?: string | null): string | null {
        const normalized = value?.split(";")[0]?.trim().toLowerCase();
        return normalized || null;
    }

    private inferMimeTypeFromUrl(mediaUrl: string): string | null {
        const urlWithoutQuery = mediaUrl.split("?")[0]?.toLowerCase() ?? "";

        if (urlWithoutQuery.endsWith(".ogg") || urlWithoutQuery.endsWith(".opus")) {
            return "audio/ogg";
        }

        if (urlWithoutQuery.endsWith(".mp3")) {
            return "audio/mpeg";
        }

        if (urlWithoutQuery.endsWith(".wav")) {
            return "audio/wav";
        }

        if (urlWithoutQuery.endsWith(".m4a")) {
            return "audio/mp4";
        }

        return null;
    }

    private extractUsageSnapshot(
        modelName: string,
        usageMetadata: unknown,
    ): AiUsageSnapshot | null {
        const usage = this.asRecord(usageMetadata);
        const promptTokenCount = this.toTokenCount(usage.promptTokenCount);
        const candidatesTokenCount = this.toTokenCount(
            usage.candidatesTokenCount,
        );
        const totalTokenCount =
            this.toTokenCount(usage.totalTokenCount) ??
            (promptTokenCount !== null && candidatesTokenCount !== null
                ? promptTokenCount + candidatesTokenCount
                : null);

        if (
            promptTokenCount === null &&
            candidatesTokenCount === null &&
            totalTokenCount === null
        ) {
            return null;
        }

        return {
            modelName,
            promptTokenCount,
            candidatesTokenCount,
            totalTokenCount,
        };
    }

    private asRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== "object") {
            return {};
        }

        return value as Record<string, unknown>;
    }

    private toTokenCount(value: unknown): number | null {
        if (typeof value === "bigint") {
            return Number(value);
        }

        if (typeof value === "number" && Number.isFinite(value)) {
            return Math.trunc(value);
        }

        if (typeof value === "string" && value.trim()) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
        }

        return null;
    }

    private getModel(personaName: string) {
        return this.getGenerativeModel(
            this.getModelName(),
            this.buildSystemPrompt(personaName),
        );
    }

    private getWhatsappModel(
        personaName: string,
        generationConfig?: GenerationConfig,
    ) {
        return this.getGenerativeModel(
            this.getWhatsappModelName(),
            this.buildWhatsappSystemPrompt(personaName),
            generationConfig,
        );
    }

    private getTranscriptionModel() {
        return this.getGenerativeModel(this.getTranscriptionModelName());
    }

    private getGenerativeModel(
        modelName: string,
        systemInstruction?: string,
        generationConfig?: GenerationConfig,
    ) {
        const apiKey = this.configService.get<string>("GEMINI_API_KEY")?.trim();

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not configured");
        }

        if (!this.genAI) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }

        return this.genAI.getGenerativeModel({
            model: modelName,
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(generationConfig ? { generationConfig } : {}),
        });
    }

    private buildSystemPrompt(personaName: string): string {
        return AI_SYSTEM_PROMPT.replace("Your name is Clara.", `Your name is ${personaName}.`);
    }

    private buildWhatsappSystemPrompt(personaName: string): string {
        return `Your name is ${personaName}. ${GROCERY_SYSTEM_PROMPT}`;
    }

    private getModelName(): string {
        return (
            this.configService.get<string>("GEMINI_MODEL")?.trim() ||
            AI_MODEL_NAME
        );
    }

    private getWhatsappModelName(): string {
        return (
            this.configService.get<string>("GEMINI_WHATSAPP_MODEL")?.trim() ||
            this.configService.get<string>("GEMINI_MODEL")?.trim() ||
            WHATSAPP_GROCERY_MODEL_NAME
        );
    }

    private getTranscriptionModelName(): string {
        return (
            this.configService
                .get<string>("GEMINI_AUDIO_TRANSCRIPTION_MODEL")
                ?.trim() ||
            this.configService.get<string>("GEMINI_MODEL")?.trim() ||
            WHATSAPP_AUDIO_TRANSCRIPTION_MODEL_NAME
        );
    }

    private buildRuntimeContext(
        personaName: string,
        products: Product[],
        previewTemplates: PreviewTemplate[],
    ): string {
        const productLines = products.length
            ? products
                  .map((product) => {
                      const price = (product.priceCents / 100)
                          .toFixed(2)
                          .replace(".", ",");
                      const description = product.description?.trim()
                          ? ` | descricao: ${product.description.trim()}`
                          : "";

                      return `- ${product.title} | preco: R$ ${price}${description}`;
                  })
                  .join("\n")
            : "- Nenhum plano ativo no momento";

        const previewLines = previewTemplates.length
            ? previewTemplates
                  .map((template) => {
                      const mediaKinds = this.getTemplateKinds(template).join(", ");
                      const itemCount =
                          template.mediaItems.length ||
                          (template.mediaUrl ? 1 : 0);
                      const tags = this.getTemplateTags(template).join(", ");

                      return `- id: ${template.id} | titulo: ${template.title} | tipo: ${template.type} | midias: ${mediaKinds || "text"} | itens: ${itemCount} | tags: ${tags || "sem tags"}`;
                  })
                  .join("\n")
            : "- Nenhum preview ativo no momento";

        return [
            "CATALOGO_ATUAL",
            `Nome da persona: ${personaName}`,
            "Planos ativos:",
            productLines,
            "",
            "Previews ativos que podem ser enviados automaticamente se o cliente pedir amostra:",
            previewLines,
            "",
            "INSTRUCOES",
            "- Liste planos somente a partir da secao de planos ativos.",
            "- Se nao houver preview relevante, nao diga que vai enviar.",
            "- Se o cliente pedir preco, plano, pack, acesso ou opcoes, apresente os planos reais.",
            "- Se o cliente escolher claramente um plano real ou pedir o PIX de um plano especifico, confirme de forma convidativa e diga que esta enviando o PIX copia e cola.",
            "- Se o cliente pedir previa, foto, video, audio, amostra ou algo para ver/ouvir, responda de forma convidativa e considere que um preview compativel pode ser enviado em seguida.",
        ].join("\n");
    }

    private buildDontSellInstruction(
        data: AiDontSellRequest,
        history: Array<{
            role: ChatMessageRole;
            content: string;
        }>,
    ): string {
        const leadName = data.leadFirstName?.trim();
        const lastUserMessage = [...history]
            .reverse()
            .find((message) => message.role === ChatMessageRole.user)
            ?.content?.trim();
        const anchorText = data.anchorTemplateText?.trim();

        return [
            "MODO_DONT_SELL_IA",
            "- Esta mensagem sera enviada proativamente para recuperar um lead que ainda nao comprou.",
            "- Responda somente com a mensagem final da Clara para o cliente.",
            "- Nao diga que a mensagem e automatica, agendada, de follow-up ou gerada por IA.",
            "- Soe humana, sedutora, leve e natural, sem exagerar e sem ser explicita.",
            "- Tente retomar o gancho da conversa e estimular resposta.",
            "- Convide a pessoa a escolher um plano ou pedir ajuda para decidir.",
            "- Nao gere PIX automaticamente nesta mensagem de resgate.",
            "- Se o historico mostrar interesse por previa, foto, video ou audio, voce pode insinuar que consegue mostrar algo.",
            leadName ? `- Nome do lead: ${leadName}` : "- Nome do lead: nao informado",
            lastUserMessage
                ? `- Ultima mensagem relevante do cliente: ${this.truncateForPrompt(lastUserMessage, 280)}`
                : "- Nao ha ultima mensagem do cliente disponivel.",
            anchorText
                ? `- Texto base configurado para o DONT_SELL, use apenas como referencia sem copiar literal: ${this.truncateForPrompt(anchorText, 280)}`
                : "- Nao ha texto base de DONT_SELL configurado.",
        ].join("\n");
    }

    private selectPreviewTemplateIds(
        messageText: string,
        previewTemplates: PreviewTemplate[],
        recentPreviewMediaUrls: string[] = [],
    ): string[] {
        const normalized = this.normalizeText(messageText);

        if (!this.isPreviewRequest(normalized)) {
            return [];
        }

        const requestedKinds = this.extractRequestedPreviewKinds(normalized);
        const excludedTerms = this.extractExcludedPreviewTerms(normalized);
        const requestingAnotherPreview =
            this.isAnotherPreviewRequest(normalized);
        const rankedTemplates = previewTemplates
            .map((template) => ({
                template,
                score: this.scorePreviewTemplate(
                    normalized,
                    requestedKinds,
                    excludedTerms,
                    recentPreviewMediaUrls,
                    requestingAnotherPreview,
                    template,
                ),
            }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score);

        const nonRepeatedTemplates = rankedTemplates.filter(
            ({ template }) =>
                !this.hasRecentPreviewMatch(template, recentPreviewMediaUrls),
        );

        const templates =
            requestingAnotherPreview && nonRepeatedTemplates.length > 0
                ? nonRepeatedTemplates.map(({ template }) => template)
                : rankedTemplates.length > 0
                  ? rankedTemplates.map(({ template }) => template)
                : requestedKinds.length
                  ? previewTemplates.filter(
                        (template) =>
                            requestedKinds.some((kind) =>
                                this.getTemplateKinds(template).includes(kind),
                            ) &&
                            !this.matchesExcludedPreviewTerms(
                                template,
                                excludedTerms,
                            ) &&
                            (!requestingAnotherPreview ||
                                !this.hasRecentPreviewMatch(
                                    template,
                                    recentPreviewMediaUrls,
                                )),
                    )
                  : previewTemplates;

        return templates
            .slice(0, 2)
            .map((template) => template.id);
    }

    private isPreviewRequest(normalized: string): boolean {
        return [
            "previa",
            "amostra",
            "foto",
            "video",
            "audio",
            "midia",
            "conteudo",
            "mostrar",
            "ver",
            "ouvir",
        ].some((keyword) => normalized.includes(keyword));
    }

    private isAnotherPreviewRequest(normalized: string): boolean {
        return [
            "outro",
            "outra",
            "mais um",
            "mais uma",
            "diferente",
            "novo",
            "nova",
            "sem repetir",
        ].some((keyword) => normalized.includes(keyword));
    }

    private extractRequestedPreviewKinds(normalized: string): string[] {
        const kinds = new Set<string>();

        if (
            normalized.includes("foto") ||
            normalized.includes("imagem") ||
            normalized.includes("nude") ||
            normalized.includes("pack")
        ) {
            kinds.add("image");
        }

        if (
            normalized.includes("video") ||
            normalized.includes("vídeo") ||
            normalized.includes("gravacao") ||
            normalized.includes("gravacao")
        ) {
            kinds.add("video");
        }

        if (
            normalized.includes("audio") ||
            normalized.includes("áudio") ||
            normalized.includes("voz") ||
            normalized.includes("ouvir")
        ) {
            kinds.add("audio");
        }

        return [...kinds];
    }

    private getTemplateKinds(template: PreviewTemplate): string[] {
        const kinds = new Set<string>();

        if (template.type === MediaType.IMAGE) {
            kinds.add("image");
        }
        if (template.type === MediaType.VIDEO) {
            kinds.add("video");
        }
        if (template.type === MediaType.AUDIO) {
            kinds.add("audio");
        }

        for (const item of template.mediaItems) {
            if (item.type === MediaType.IMAGE) {
                kinds.add("image");
            }
            if (item.type === MediaType.VIDEO) {
                kinds.add("video");
            }
            if (item.type === MediaType.AUDIO) {
                kinds.add("audio");
            }
        }

        return [...kinds];
    }

    private getTemplateTags(template: PreviewTemplate): string[] {
        const tags = new Set<string>();

        for (const tag of template.tags ?? []) {
            tags.add(this.normalizeText(tag));
        }

        for (const item of template.mediaItems) {
            for (const tag of item.tags ?? []) {
                tags.add(this.normalizeText(tag));
            }
        }

        return [...tags];
    }

    private getTemplateSemanticTerms(template: PreviewTemplate): Set<string> {
        const terms = new Set<string>();

        for (const tag of this.getTemplateTags(template)) {
            for (const term of this.buildSemanticTermSet(tag)) {
                terms.add(term);
            }
        }

        return terms;
    }

    private scorePreviewTemplate(
        normalizedMessage: string,
        requestedKinds: string[],
        excludedTerms: Set<string>,
        recentPreviewMediaUrls: string[],
        requestingAnotherPreview: boolean,
        template: PreviewTemplate,
    ): number {
        const messageTerms = this.buildSemanticTermSet(normalizedMessage);
        let score = 0;
        const tags = this.getTemplateTags(template);
        const kinds = this.getTemplateKinds(template);

        if (
            requestedKinds.length > 0 &&
            !requestedKinds.some((kind) => kinds.includes(kind))
        ) {
            return 0;
        }

        if (this.matchesExcludedPreviewTerms(template, excludedTerms)) {
            return 0;
        }

        for (const tag of tags) {
            score += this.scoreTagMatch(normalizedMessage, messageTerms, tag);
        }

        for (const kind of requestedKinds) {
            if (kinds.includes(kind)) {
                score += 6;
            }
        }

        if (this.hasRecentPreviewMatch(template, recentPreviewMediaUrls)) {
            score -= requestingAnotherPreview ? 100 : 18;
        }

        return score;
    }

    private extractExcludedPreviewTerms(normalizedMessage: string): Set<string> {
        const excludedTerms = new Set<string>();
        const patterns = [
            /sem ser de ([a-z0-9\s]+)/g,
            /sem ser do ([a-z0-9\s]+)/g,
            /sem ser da ([a-z0-9\s]+)/g,
            /sem ([a-z0-9\s]+)/g,
            /nao de ([a-z0-9\s]+)/g,
            /nao do ([a-z0-9\s]+)/g,
            /nao da ([a-z0-9\s]+)/g,
            /tirando ([a-z0-9\s]+)/g,
            /menos ([a-z0-9\s]+)/g,
        ];

        for (const pattern of patterns) {
            for (const match of normalizedMessage.matchAll(pattern)) {
                const segment = match[1]?.trim();
                if (!segment) {
                    continue;
                }

                for (const term of this.buildSemanticTermSet(segment)) {
                    excludedTerms.add(term);
                }
            }
        }

        return excludedTerms;
    }

    private matchesExcludedPreviewTerms(
        template: PreviewTemplate,
        excludedTerms: Set<string>,
    ): boolean {
        if (!excludedTerms.size) {
            return false;
        }

        const templateTerms = this.getTemplateSemanticTerms(template);
        return [...excludedTerms].some((term) => templateTerms.has(term));
    }

    private hasRecentPreviewMatch(
        template: PreviewTemplate,
        recentPreviewMediaUrls: string[],
    ): boolean {
        if (!recentPreviewMediaUrls.length) {
            return false;
        }

        const recentSet = new Set(recentPreviewMediaUrls);
        if (template.mediaUrl && recentSet.has(template.mediaUrl)) {
            return true;
        }

        return template.mediaItems.some((item) => recentSet.has(item.url));
    }

    private scoreTagMatch(
        normalizedMessage: string,
        messageTerms: Set<string>,
        tag: string,
    ): number {
        const normalizedTag = this.normalizeText(tag).trim();
        if (!normalizedTag) {
            return 0;
        }

        let score = 0;

        if (normalizedMessage.includes(normalizedTag)) {
            score += 14;
        }

        const directTagTokens = this.extractPreviewSearchTokens(normalizedTag);
        const semanticTagTerms = this.buildSemanticTermSet(normalizedTag);
        const matchedDirectTokens = directTagTokens.filter((token) =>
            messageTerms.has(token),
        );
        const sharedSemanticTerms = [...semanticTagTerms].filter((term) =>
            messageTerms.has(term),
        );

        if (directTagTokens.length > 0) {
            if (matchedDirectTokens.length === directTagTokens.length) {
                score += 10;
            } else {
                score += matchedDirectTokens.length * 3;
            }
        }

        score += sharedSemanticTerms.length * 4;

        return score;
    }

    private buildSemanticTermSet(value: string): Set<string> {
        const normalized = this.normalizeText(value);
        const terms = new Set(this.extractPreviewSearchTokens(normalized));

        for (const group of PREVIEW_TAG_SYNONYM_GROUPS) {
            if (
                group.some(
                    (term) =>
                        normalized.includes(term) || terms.has(term),
                )
            ) {
                for (const term of group) {
                    terms.add(term);
                }
            }
        }

        return terms;
    }

    private extractPreviewSearchTokens(value: string): string[] {
        const stopWords = new Set([
            "ela",
            "dele",
            "dela",
            "com",
            "sem",
            "ser",
            "nao",
            "não",
            "para",
            "pra",
            "uma",
            "uns",
            "umas",
            "que",
            "tomando",
            "quero",
            "manda",
            "mostrar",
            "mostra",
            "outro",
            "outra",
            "mais",
            "novo",
            "nova",
            "previa",
            "amostra",
            "video",
            "foto",
            "audio",
        ]);

        return this.normalizeText(value)
            .split(/[^a-z0-9]+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 1 && !stopWords.has(token));
    }

    private selectProductIdForCharge(
        messageText: string,
        products: Product[],
    ): string | undefined {
        const normalized = this.normalizeText(messageText);

        if (!this.isPurchaseIntent(normalized) || !products.length) {
            return undefined;
        }

        if (normalized.includes("mais barato")) {
            return products[0]?.id;
        }

        if (normalized.includes("mais caro")) {
            return products[products.length - 1]?.id;
        }

        const rankedProducts = products
            .map((product) => ({
                product,
                score: this.scoreProductMatch(normalized, product),
            }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score);

        if (rankedProducts.length === 1) {
            return rankedProducts[0].product.id;
        }

        if (
            rankedProducts.length > 1 &&
            rankedProducts[0].score > rankedProducts[1].score
        ) {
            return rankedProducts[0].product.id;
        }

        if (products.length === 1) {
            return products[0].id;
        }

        return undefined;
    }

    private isPurchaseIntent(normalized: string): boolean {
        return [
            "comprar",
            "quero comprar",
            "quero assinar",
            "assinar",
            "fechar",
            "pagar",
            "pix",
            "manda o pix",
            "me manda o pix",
            "gera o pix",
            "quero esse",
            "vou querer",
            "vou ficar",
        ].some((keyword) => normalized.includes(keyword));
    }

    private scoreProductMatch(normalized: string, product: Product): number {
        let score = 0;
        const title = this.normalizeText(product.title);
        const description = this.normalizeText(product.description ?? "");

        if (title && normalized.includes(title)) {
            score += 100;
        }

        for (const token of this.extractSearchTokens(product.title)) {
            if (normalized.includes(token)) {
                score += 8;
            }
        }

        for (const token of this.extractSearchTokens(product.description ?? "")) {
            if (normalized.includes(token)) {
                score += 2;
            }
        }

        if (description && normalized.includes(description)) {
            score += 15;
        }

        return score;
    }

    private extractSearchTokens(value: string): string[] {
        const stopWords = new Set([
            "de",
            "da",
            "do",
            "das",
            "dos",
            "e",
            "a",
            "o",
            "para",
            "com",
            "sem",
            "plano",
            "conteudo",
            "conteudos",
        ]);

        return this.normalizeText(value)
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length > 2 && !stopWords.has(token));
    }

    private normalizeText(value: string): string {
        return value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    private truncateForPrompt(value: string, maxLength: number): string {
        const trimmed = value.trim();
        if (trimmed.length <= maxLength) {
            return trimmed;
        }

        return `${trimmed.slice(0, maxLength - 3)}...`;
    }

    private getPersonaName(botAccount: BotAccount | null): string {
        const rawName = botAccount?.name?.trim();
        return rawName || "Clara";
    }

    private buildWhatsappConversationKey(
        instanceId: string,
        chatId: string,
    ): string {
        return `whatsapp:${instanceId}:${chatId}`;
    }

    private buildPreviewMessageLogs(
        botId: string,
        telegramUserId: string,
        template: PreviewTemplate,
    ): Array<{
        botId: string;
        telegramUserId: string;
        direction: MessageDirection;
        type: MediaType;
        text?: string | null;
        mediaUrl?: string | null;
        providerMessageId?: string | null;
    }> {
        const logs: Array<{
            botId: string;
            telegramUserId: string;
            direction: MessageDirection;
            type: MediaType;
            text?: string | null;
            mediaUrl?: string | null;
            providerMessageId?: string | null;
        }> = [];

        if (template.mediaUrl) {
            logs.push({
                botId,
                telegramUserId,
                direction: MessageDirection.OUT,
                type: template.type,
                text: template.text ?? null,
                mediaUrl: template.mediaUrl,
                providerMessageId: null,
            });
        }

        for (const item of template.mediaItems) {
            logs.push({
                botId,
                telegramUserId,
                direction: MessageDirection.OUT,
                type: item.type,
                text: template.text ?? null,
                mediaUrl: item.url,
                providerMessageId: null,
            });
        }

        return logs;
    }
}
