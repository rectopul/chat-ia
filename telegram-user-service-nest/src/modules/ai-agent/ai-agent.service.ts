import { InjectQueue } from "@nestjs/bullmq";
import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import IORedis, { Redis } from "ioredis";
import {
    BotAccount,
    BusinessProfile,
    ChatMessageType,
    ChatMessageRole,
    DeliveryType,
    MediaType,
    MessageDirection,
    MessageTemplate,
    MessageTemplateMedia,
    PaymentMethod,
    Product,
} from "@prisma/client";
import {
    GenerationConfig,
    GenerativeModel,
    GoogleGenerativeAI,
    ResponseSchema,
    SchemaType,
} from "@google/generative-ai";
import { Queue } from "bullmq";
import { DeliveryOrderService } from "../delivery/delivery-order.service";
import {
    getEffectiveProductPriceCents,
    hasValidPromotionalPrice,
} from "../delivery/product-pricing";
import {
    ProductSearchResult,
    ProductService,
} from "../delivery/product.service";
import {
    TemporaryCart,
    TemporaryCartItem,
    TemporaryCartService,
} from "../delivery/temporary-cart.service";
import {
    AiAgentRepository,
    BotAccountWithOwnerSettings,
    DeliveryCatalogProduct,
    OwnerCheckoutSettings,
} from "./ai-agent.repository";
import { SubscriptionService } from "../subscription/subscription.service";
import { isAiServiceBusyError } from "./ai-error.utils";
import { AiAudioService } from "./ai-audio.service";
import { SyncPayService } from "../../syncpay/syncpay.service";

export const AI_RESPONSE_QUEUE_NAME = "ai-response";
export const AI_RESPONSE_JOB_NAME = "generate-ai-response";

const AI_MODEL_NAME = "gemini-2.5-flash";
const WHATSAPP_GROCERY_MODEL_NAME = "gemini-2.5-flash";
const WHATSAPP_AUDIO_TRANSCRIPTION_MODEL_NAME = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL_NAME = "gemini-2.0-flash";
const GEMINI_PRIMARY_COOLDOWN_MS = 300_000;
const GEMINI_PRIMARY_RECOVERY_SUCCESS_COUNT = 4;
const GEMINI_CIRCUIT_KEY_PREFIX = "ai:gemini:circuit";
const BUSINESS_SYSTEM_PROMPT = [
    "Answer in Brazilian Portuguese.",
    "You are the main sales assistant for a Brazilian business.",
    "Use the runtime catalog and the business profile instructions to decide how to sell.",
    "Only mention products, services, menus, packages, or media examples that exist in the runtime catalog provided to you.",
    "Never invent prices, ingredients, stock, package details, benefits, files, budgets, deadlines, or promises that are not in the runtime context.",
    "If the customer asks for options, present only the real options from the runtime catalog.",
    "If the customer clearly chooses a real item or service, confirm naturally and guide the next step without inventing payment data.",
    "If the customer asks for photos, videos, audio, samples, menu images, or examples, only say you are sending them when compatible media exists in the runtime context.",
    "Keep answers concise, clear, and sales-oriented.",
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
    "If the user clearly wants to finish the purchase, close the order, or receive the delivery, set intent to FINALIZE_ORDER.",
    "If intent is FINALIZE_ORDER and the cart already has items and the fulfillment info is filled, do not ask questions such as Posso finalizar.",
    "When intent is FINALIZE_ORDER and the order is ready, reply assertively confirming that the order was sent to the kitchen or preparation.",
    "If the user says ja falei para finalizar or equivalent, treat that as maximum priority to close the order immediately.",
    "Explain local payment options clearly: pagamento na entrega means the courier brings the card machine or the Pix QR code at handoff, and pagamento online means a Pix code generated now for immediate confirmation.",
    "If pickup is selected, ask whether the customer prefers to pay now with PIX_ONLINE or to pay directly at the counter when picking up, whenever both options are available in the runtime checkout settings.",
    "Understand that expressions such as receber no local, pagar no local, no balcao, na entrega, com o entregador, or pagar ao retirar refer to physical payment at handoff.",
    "When deliveryType is DELIVERY, always confirm the delivery address before treating the order as ready to finalize.",
    "If the latest message came from audio transcription, prioritize the customer action over noisy transcription fragments, repeated words, or trailing garbage text.",
    "Ignore transcription noise or repetitive fragments from consecutive audios when the customer intent is still clear.",
    "If the history already shows that the customer confirmed the fulfillment info and the order, and a new audio arrives with a confirmation tone, mark intent as FINALIZE_ORDER without asking for new validation.",
    "When extracting a delivery address, remove confirmation or greeting terms such as sim, ta certo, ok, pode entregar, no endereco, and valeu.",
    "The delivery address must contain only street name, number, neighborhood, and complement when available.",
    "Example: user text='Sim, pode entregar na Rua X, 123, Centro' => cleaned address='Rua X, 123, Centro'.",
    "When the runtime cart context includes a delivery fee, treat it as part of the order total.",
    "Utilize as tags dos produtos para fazer recomendacoes inteligentes e responder a buscas por caracteristicas (ex: se o cliente pedir algo 'saudavel' ou 'para churrasco', filtre pelas tags correspondentes).",
    "When a product has a promotional price in the catalog, treat that as the current selling price.",
    "Return only valid JSON with intent, replyText, paymentMethod, wantsChange, changeFor, deliveryType, cartOperations, and suggestedProductIds.",
].join(" ");

const GROCERY_RESPONSE_SCHEMA: ResponseSchema = {
    type: SchemaType.OBJECT,
    required: ["intent", "replyText", "cartOperations", "suggestedProductIds"],
    properties: {
        intent: {
            type: SchemaType.STRING,
            enum: [
                "ADD_TO_CART",
                "REMOVE_FROM_CART",
                "SELECT_PAYMENT_METHOD",
                "FINALIZE_ORDER",
                "GENERAL_INQUIRY",
            ],
            description:
                "Main customer intent for this turn.",
        },
        replyText: {
            type: SchemaType.STRING,
            description:
                "Short reply in Brazilian Portuguese to be sent to the customer.",
        },
        paymentMethod: {
            type: SchemaType.STRING,
            enum: [
                "PIX_ONLINE",
                "PIX_DELIVERY",
                "CARD_DELIVERY",
                "CASH",
            ],
            description:
                "Optional checkout payment method selected by the customer.",
        },
        wantsChange: {
            type: SchemaType.BOOLEAN,
            description:
                "Set to true when the customer says they need change for cash payment.",
        },
        changeFor: {
            type: SchemaType.NUMBER,
            description:
                "Optional amount the customer will hand over so the system can calculate change.",
        },
        deliveryType: {
            type: SchemaType.STRING,
            enum: ["DELIVERY", "PICKUP"],
            description:
                "Delivery flow selected by the customer.",
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
    delayedConfirmationText?: string | null;
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
    instanceName?: string;
    chatId: string;
    ownerUserId: string;
    personaName: string;
    businessProfile?: BusinessProfile;
    messageId?: string | null;
    debounceMessageCount?: number | null;
    messageText?: string;
    mediaUrl?: string | null;
    mediaMimeType?: string | null;
    messageType?: ChatMessageType;
}

type PreviewTemplate = MessageTemplate & {
    mediaItems: MessageTemplateMedia[];
};

type BusinessProfilePromptConfig = {
    profileLabel: string;
    toneInstruction: string;
    systemInstructions: string[];
    runtimeCatalogTitle: string;
    emptyCatalogText: string;
    runtimeMediaTitle: string;
    emptyMediaText: string;
    runtimeInstructions: string[];
};

type GroceryCartOperation = {
    productId: string;
    quantity: number;
    mode?: "set" | "add";
};

type GroceryIntent =
    | "ADD_TO_CART"
    | "REMOVE_FROM_CART"
    | "ASK_DELIVERY_TYPE"
    | "SELECT_PAYMENT_METHOD"
    | "FINALIZE_ORDER"
    | "GENERAL_INQUIRY";

type GroceryAiStructuredResponse = {
    replyText?: string;
    intent?: GroceryIntent;
    paymentMethod?: PaymentMethod;
    wantsChange?: boolean;
    changeFor?: number;
    deliveryType?: DeliveryType;
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

type AiModelScope = "default" | "whatsapp" | "transcription";

type AiModelExecution<T> = {
    result: T;
    modelName: string;
};

type AiCircuitState = {
    exists: boolean;
    openUntilMs: number;
    recoverySuccessCount: number;
};

type GeminiApiModel = {
    name?: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
};

type CheckoutDecision =
    | {
          finalizeNow: false;
          text: string;
      }
    | {
          finalizeNow: true;
          text: string;
      };

@Injectable()
export class AiAgentService implements OnModuleDestroy, OnModuleInit {
    private readonly logger = new Logger(AiAgentService.name);
    private genAI?: GoogleGenerativeAI;
    private readonly redis: Redis;
    private hasLoggedAvailableModels = false;

    constructor(
        private readonly configService: ConfigService,
        private readonly repository: AiAgentRepository,
        private readonly aiAudioService: AiAudioService,
        private readonly subscriptionService: SubscriptionService,
        private readonly productService: ProductService,
        private readonly temporaryCartService: TemporaryCartService,
        private readonly deliveryOrderService: DeliveryOrderService,
        private readonly syncPayService: SyncPayService,
        @InjectQueue(AI_RESPONSE_QUEUE_NAME)
        private readonly aiResponseQueue: Queue<AiResponseJobData>,
    ) {
        if (process.env.REDIS_URL) {
            this.redis = new IORedis(process.env.REDIS_URL);
        } else {
            this.redis = new IORedis({
                host: process.env.REDIS_HOST ?? "localhost",
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD || undefined,
                db: Number(process.env.REDIS_DB ?? 0),
            });
        }

        this.redis.on("error", (error: Error) => {
            this.logger.error(
                `[redis] falha no circuito de fallback do Gemini: ${error.message}`,
                error.stack,
            );
        });
    }

    async onModuleDestroy(): Promise<void> {
        try {
            await this.redis.quit();
        } catch (error: unknown) {
            this.logger.debug(
                `[redis] erro ao encerrar circuito do Gemini: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    onModuleInit(): void {
        void this.logAvailableModelsOnce();
    }

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
        const businessProfile = this.getBusinessProfile(botAccount);
        const execution = await this.generateContentWithFallback({
            scope: "default",
            primaryModelName: this.getPrimaryModelName(),
            fallbackModelName: this.getFallbackModelName(),
            systemInstruction: this.buildSystemPrompt(
                personaName,
                businessProfile,
            ),
            request: (model) =>
                model.generateContent({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: this.buildRuntimeContext(
                                        personaName,
                                        products,
                                        previewTemplates,
                                        businessProfile,
                                    ),
                                },
                            ],
                        },
                        ...history.map((message) => ({
                            role: message.role as GeminiRole,
                            parts: [{ text: message.content }],
                        })),
                    ],
                }),
        });
        const result = execution.result;

        const responseText = result.response.text().trim();

        if (!responseText) {
            throw new Error("Gemini returned an empty response");
        }

        this.logger.debug(
            `[generateResponse] telegramId=${telegramId} history=${history.length} model=${execution.modelName}`,
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
                execution.modelName,
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
        const businessProfile = this.getBusinessProfile(botAccount);
        const execution = await this.generateContentWithFallback({
            scope: "default",
            primaryModelName: this.getPrimaryModelName(),
            fallbackModelName: this.getFallbackModelName(),
            systemInstruction: this.buildSystemPrompt(
                personaName,
                businessProfile,
            ),
            request: (model) =>
                model.generateContent({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: this.buildRuntimeContext(
                                        personaName,
                                        products,
                                        previewTemplates,
                                        businessProfile,
                                    ),
                                },
                                {
                                    text: this.buildDontSellInstruction(
                                        data,
                                        history,
                                    ),
                                },
                            ],
                        },
                        ...history.map((message) => ({
                            role: message.role as GeminiRole,
                            parts: [{ text: message.content }],
                        })),
                    ],
                }),
        });
        const result = execution.result;

        const responseText = result.response.text().trim();

        if (!responseText) {
            throw new Error("Gemini returned an empty dont sell response");
        }

        const signalText = history
            .filter((message) => message.role === ChatMessageRole.user)
            .map((message) => message.content)
            .join(" ");

        this.logger.debug(
            `[generateDontSellResponse] telegramId=${data.telegramId} history=${history.length} model=${execution.modelName}`,
        );

        return {
            text: responseText,
            previewTemplateIds: this.selectPreviewTemplateIds(
                signalText,
                previewTemplates,
                recentPreviewMediaUrls,
            ),
            usage: this.extractUsageSnapshot(
                execution.modelName,
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

        const [
            history,
            products,
            previewTemplates,
            initialCart,
            matchedProducts,
            checkoutSettings,
        ] =
            await Promise.all([
                this.repository.getConversationMessages(conversationKey, 10),
                this.repository.getActiveDeliveryProductsForOwner(
                    data.ownerUserId,
                ),
                this.repository.getActivePreviewTemplatesForOwner(
                    data.ownerUserId,
                ),
                this.temporaryCartService.getCart(data.chatId),
                this.productService.searchProducts({
                    instanceId: data.instanceId,
                    ownerUserId: data.ownerUserId,
                    query: messageText,
                    onlyAvailable: false,
                    limit: 12,
                }),
                this.repository.getOwnerCheckoutSettings(data.ownerUserId),
            ]);
        const latestAssistantMessage =
            this.getLatestAssistantMessageContent(history);
        let currentCart = initialCart;
        const deliveryAddressCapture =
            await this.maybeCaptureDeliveryAddressFromText({
                messageText,
                cart: currentCart,
                chatId: data.chatId,
                instanceId: data.instanceId,
                ownerUserId: data.ownerUserId,
            });

        currentCart = deliveryAddressCapture.cart;

        const relatedProducts = this.selectRelatedProducts(
            products,
            this.resolveMentionedProducts(products, matchedProducts),
            currentCart,
        );

        if (currentCart.items.length > 0) {
            const deterministicReply =
                this.maybeBuildDeterministicWhatsappReply({
                    messageText,
                    cart: currentCart,
                    latestAssistantMessage,
                    addressJustCaptured:
                        deliveryAddressCapture.wasCapturedFromCurrentMessage,
                });

            if (deterministicReply) {
                return {
                    text: deterministicReply,
                    previewTemplateIds: [],
                    usage: null,
                };
            }
        }

        const structuredReply = await this.generateWhatsappGroceryReply({
            personaName: data.personaName,
            businessProfile:
                data.businessProfile ?? BusinessProfile.GROCERY,
            history,
            catalogProducts: products,
            matchedProducts,
            currentCart,
            relatedProducts,
            originalMessageType: resolvedInput.originalMessageType,
            latestAssistantMessage,
            checkoutSettings,
        });
        const effectiveStructuredReply =
            this.resolveWhatsappStructuredReplyIntent({
                structuredReply,
                messageText,
                originalMessageType: resolvedInput.originalMessageType,
                cart: currentCart,
                latestAssistantMessage,
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
                effectiveStructuredReply.cartOperations ?? [],
                messageText,
                effectiveStructuredReply,
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
                usage: effectiveStructuredReply.usage ?? null,
            };
        }

        if (effectiveStructuredReply.intent === "FINALIZE_ORDER") {
            if (!cartUpdateResult.cart.items.length) {
                return {
                    text: "Ainda nao tenho itens no seu carrinho. Me diga o que voce quer pedir e a quantidade que eu separo pra voce.",
                    previewTemplateIds: [],
                    usage: effectiveStructuredReply.usage ?? null,
                };
            }

            if (
                cartUpdateResult.cart.deliveryType !== DeliveryType.PICKUP &&
                !cartUpdateResult.cart.deliveryAddress?.trim()
            ) {
                return {
                    text: this.buildAddressRequestReplyText(cartUpdateResult.cart),
                    previewTemplateIds: [],
                    usage: effectiveStructuredReply.usage ?? null,
                };
            }
        }

        const checkoutDecision = await this.resolveWhatsappCheckoutDecision({
            instanceId: data.instanceId,
            chatId: data.chatId,
            ownerUserId: data.ownerUserId,
            cart: cartUpdateResult.cart,
            intent: effectiveStructuredReply.intent,
            checkoutSettings,
        });

        if (checkoutDecision) {
            if (checkoutDecision.finalizeNow) {
                const finalizedOrder = await this.maybeFinalizeWhatsappOrder({
                    instanceId: data.instanceId,
                    chatId: data.chatId,
                    cart: cartUpdateResult.cart,
                    intent: "FINALIZE_ORDER",
                });

                if (finalizedOrder) {
                    await this.temporaryCartService.clearCart(data.chatId);
                }
            }

            return {
                text: checkoutDecision.text,
                previewTemplateIds: [],
                usage: effectiveStructuredReply.usage ?? null,
            };
        }

        const finalizedOrder = await this.maybeFinalizeWhatsappOrder({
            instanceId: data.instanceId,
            chatId: data.chatId,
            cart: cartUpdateResult.cart,
            intent: effectiveStructuredReply.intent,
        });

        if (finalizedOrder) {
            await this.temporaryCartService.clearCart(data.chatId);
        }

        const shouldDeferConfirmationQuestion =
            this.shouldDeferCartConfirmationQuestion({
                messageText,
                latestAssistantMessage,
                appliedOperations: cartUpdateResult.appliedOperations,
            });
        const shouldSkipConfirmationQuestion =
            this.shouldSkipConfirmationQuestionForBatch({
                messageText,
                appliedOperations: cartUpdateResult.appliedOperations,
                debounceMessageCount: data.debounceMessageCount ?? null,
            }) || shouldDeferConfirmationQuestion;
        const delayedConfirmationText =
            !finalizedOrder && shouldDeferConfirmationQuestion
                ? this.buildDelayedCartConfirmationText(cartUpdateResult.cart)
                : null;

        const responseText = finalizedOrder
            ? this.buildOrderFinalizedReplyText(cartUpdateResult.cart)
            : this.buildWhatsappReplyText({
            fallbackReplyText: structuredReply.replyText,
            appliedOperations: cartUpdateResult.appliedOperations,
            cart: cartUpdateResult.cart,
            skipConfirmationQuestion: shouldSkipConfirmationQuestion,
            relatedProducts: this.selectRelatedProducts(
                products,
                this.resolveMentionedProducts(products, matchedProducts),
                cartUpdateResult.cart,
                effectiveStructuredReply.suggestedProductIds,
            ),
        });

        this.logger.debug(
            `[generateWhatsappResponse] instanceId=${data.instanceId} chatId=${data.chatId} history=${history.length} model=${effectiveStructuredReply.usage?.modelName ?? this.getWhatsappModelName()}`,
        );

        return {
            text: responseText,
            delayedConfirmationText,
            previewTemplateIds: this.selectPreviewTemplateIds(
                messageText,
                previewTemplates,
            ),
            usage: effectiveStructuredReply.usage ?? null,
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
                data.instanceName,
                data.messageId,
                data.mediaUrl,
                data.mediaMimeType,
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

    private async transcribeWhatsappAudio(
        instanceName: string | undefined,
        messageId: string | null | undefined,
        mediaUrl: string,
        mimeTypeHint?: string | null,
    ): Promise<{
        transcript: string;
        usage: AiUsageSnapshot | null;
    }> {
        const audio = await this.aiAudioService.fetchWhatsappAudio({
            instanceName: instanceName?.trim() || "unknown-instance",
            messageId,
            mediaUrl,
            mimeTypeHint,
        });
        const execution = await this.generateContentWithFallback({
            scope: "transcription",
            primaryModelName: this.getTranscriptionModelName(),
            fallbackModelName: this.getTranscriptionFallbackModelName(),
            request: (model) =>
                model.generateContent([
                    "Transcreva este audio em portugues do Brasil. Responda apenas com a transcricao limpa, sem aspas, sem comentarios e sem formatacao extra. Se o audio estiver indisponivel, corrompido, vazio ou ilegivel, responda exatamente com TRANSCRICAO_INDISPONIVEL.",
                    {
                        inlineData: {
                            data: audio.buffer.toString("base64"),
                            mimeType: audio.mimeType,
                        },
                    },
                ]),
        });
        const result = execution.result;
        const transcript = result.response.text().trim();

        if (!transcript) {
            throw new Error("Gemini returned an empty audio transcription");
        }

        if (this.isUnavailableWhatsappAudioTranscript(transcript)) {
            throw new Error("WhatsApp audio transcription is unavailable");
        }

        return {
            transcript,
            usage: this.extractUsageSnapshot(
                execution.modelName,
                result.response.usageMetadata,
            ),
        };
    }

    private async generateWhatsappGroceryReply(input: {
        personaName: string;
        businessProfile: BusinessProfile;
        checkoutSettings: OwnerCheckoutSettings;
        history: Array<{
            role: ChatMessageRole;
            content: string;
        }>;
        catalogProducts: DeliveryCatalogProduct[];
        matchedProducts: ProductSearchResult[];
        currentCart: TemporaryCart;
        relatedProducts: DeliveryCatalogProduct[];
        originalMessageType: ChatMessageType;
        latestAssistantMessage: string | null;
    }): Promise<GroceryAiStructuredResponse> {
        const execution = await this.generateContentWithFallback({
            scope: "whatsapp",
            primaryModelName: this.getWhatsappModelName(),
            fallbackModelName: this.getWhatsappFallbackModelName(),
            systemInstruction: this.buildWhatsappSystemPrompt(
                input.personaName,
                input.businessProfile,
            ),
            generationConfig: GROCERY_JSON_GENERATION_CONFIG,
            request: (model) =>
                model.generateContent({
                    contents: [
                        {
                            role: "user",
                            parts: [
                                {
                                    text: this.buildWhatsappGroceryRuntimeContext(
                                        input,
                                    ),
                                },
                            ],
                        },
                        ...input.history.map((message) => ({
                            role: message.role as GeminiRole,
                            parts: [{ text: message.content }],
                        })),
                    ],
                }),
        });
        const result = execution.result;
        const rawText = result.response.text().trim();

        if (!rawText) {
            throw new Error("Gemini returned an empty WhatsApp grocery response");
        }

        return {
            ...this.normalizeStructuredGroceryReply(rawText),
            usage: this.extractUsageSnapshot(
                execution.modelName,
                result.response.usageMetadata,
            ),
        };
    }

    private buildWhatsappGroceryRuntimeContext(input: {
        personaName: string;
        businessProfile: BusinessProfile;
        checkoutSettings: OwnerCheckoutSettings;
        catalogProducts: DeliveryCatalogProduct[];
        matchedProducts: ProductSearchResult[];
        currentCart: TemporaryCart;
        relatedProducts: DeliveryCatalogProduct[];
        originalMessageType: ChatMessageType;
        latestAssistantMessage: string | null;
    }): string {
        const profileConfig = this.getBusinessProfilePromptConfig(
            input.businessProfile,
        );
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
            `Perfil de negocio: ${profileConfig.profileLabel}`,
            `Tipo da ultima mensagem do cliente: ${input.originalMessageType}`,
            "",
            "Carrinho temporario atual do cliente:",
            this.buildCartContext(input.currentCart),
            "",
            "Configuracao de checkout do lojista:",
            `- Tipos de entrega disponiveis: ${this.joinHumanList(
                this.resolveAvailableDeliveryTypes(
                    input.checkoutSettings,
                ).map((type) => this.describeDeliveryType(type)),
            )}`,
            `- Formas de pagamento aceitas: ${this.joinHumanList(
                this.resolveAcceptedPaymentMethods(
                    input.checkoutSettings,
                ).map((method) => this.describePaymentMethod(method)),
            )}`,
            "",
            "Ultima resposta enviada pelo atendente:",
            input.latestAssistantMessage?.trim() || "- Nenhuma resposta anterior.",
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
            '{"intent":"ADD_TO_CART", "replyText":"...", "deliveryType":"DELIVERY", "paymentMethod":"PIX_ONLINE", "changeFor":null, "cartOperations":[{"productId":"...", "quantity":2, "mode":"set"}], "suggestedProductIds":["..."]}',
            "",
            "REGRAS",
            "- Responda somente com JSON valido.",
            "- intent deve ser um destes valores: ADD_TO_CART, REMOVE_FROM_CART, SELECT_PAYMENT_METHOD, FINALIZE_ORDER ou GENERAL_INQUIRY.",
            "- replyText deve ser cordial, curto e objetivo.",
            "- Sempre confirme quantidades quando o cliente pedir itens.",
            "- Se a quantidade estiver clara, preencha cartOperations com IDs reais do catalogo.",
            "- Se a quantidade nao estiver clara, deixe cartOperations vazio e pergunte quantas unidades.",
            "- Se o carrinho ja tiver itens e o cliente pedir um novo produto, mantenha os itens anteriores e adicione somente o novo item pedido.",
            "- Se o cliente pedir mais de um item, voce pode enviar varias operacoes.",
            "- Se o cliente disser 'mais', prefira mode='add'. Caso contrario, use mode='set'.",
            "- Se o cliente responder apenas com confirmacoes curtas como 'sim', 'correto' ou 'isso mesmo', nao repita a mesma pergunta de quantidade.",
            "- Se o cliente escolher entrega ou retirada, preencha deliveryType com DELIVERY ou PICKUP.",
            "- Se o cliente escolher a forma de pagamento, preencha paymentMethod com PIX_ONLINE, PIX_DELIVERY, CARD_DELIVERY ou CASH.",
            "- Se o cliente informar valor para troco, preencha changeFor com o valor numerico.",
            "- Explique com clareza que pagamento na entrega significa que o entregador leva a maquininha de cartao ou o QR Code do Pix no momento da entrega.",
            "- Explique com clareza que pagamento online significa gerar agora o codigo Pix para confirmacao imediata.",
            "- Se o cliente escolher PICKUP, pergunte se ele prefere pagar agora por PIX_ONLINE ou pagar no balcao ao retirar, sempre que as duas opcoes estiverem disponiveis no checkout do lojista.",
            "- Entenda que expressoes como receber no local, pagar no local, na entrega, com o entregador, no balcao ou pagar ao retirar significam recebimento fisico no momento da entrega ou retirada.",
            "- Se deliveryType for DELIVERY, sempre confirme o endereco de entrega antes de considerar o pedido pronto para finalizar.",
            "- Se deliveryType, paymentMethod ou changeFor ja estiverem preenchidos no contexto atual do carrinho, nao pergunte novamente a menos que o cliente queira mudar essa informacao.",
            "- Se o cliente quiser claramente encerrar a compra, concluir o pedido ou receber a entrega, use intent='FINALIZE_ORDER'.",
            "- Se intent='FINALIZE_ORDER' e o carrinho ja tiver itens e endereco, nao pergunte 'Posso finalizar?'; confirme que o pedido foi enviado para preparo.",
            "- Se o cliente disser algo como 'ja falei para finalizar', trate isso como prioridade maxima para fechar o pedido imediatamente.",
            "- Use as tags dos produtos para entender caracteristicas como saudavel, churrasco, gelado, premium, integral ou zero acucar.",
            "- suggestedProductIds deve usar somente IDs reais do catalogo relacionado. Se nao fizer sentido, envie [].",
        ].join("\n");
    }

    private resolveWhatsappStructuredReplyIntent(input: {
        structuredReply: GroceryAiStructuredResponse;
        messageText: string;
        originalMessageType: ChatMessageType;
        cart: TemporaryCart;
        latestAssistantMessage: string | null;
    }): GroceryAiStructuredResponse {
        if (
            input.originalMessageType !== ChatMessageType.AUDIO ||
            input.structuredReply.intent === "FINALIZE_ORDER"
        ) {
            return input.structuredReply;
        }

        if (
            !input.cart.items.length ||
            (input.cart.deliveryType !== DeliveryType.PICKUP &&
                !input.cart.deliveryAddress?.trim())
        ) {
            return input.structuredReply;
        }

        const assistantAlreadyAtFinalizeStep =
            this.didAssistantAskToFinalize(input.latestAssistantMessage) ||
            this.didAssistantAskCartConfirmation(input.latestAssistantMessage);
        const customerSoundsConfirmatory =
            this.isSimpleCartConfirmationIntent(input.messageText) ||
            this.isNoMoreItemsIntent(input.messageText) ||
            this.hasStrongFinalizeCue(input.messageText);

        if (!assistantAlreadyAtFinalizeStep || !customerSoundsConfirmatory) {
            return input.structuredReply;
        }

        return {
            ...input.structuredReply,
            intent: "FINALIZE_ORDER",
        };
    }

    private async updateCart(
        whatsappId: string,
        instanceId: string,
        ownerUserId: string,
        operations: GroceryCartOperation[],
        sourceMessageText: string,
        structuredReply?: Pick<
            GroceryAiStructuredResponse,
            "deliveryType" | "paymentMethod" | "changeFor" | "wantsChange"
        >,
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

        cart = await this.applyStructuredCheckoutContext(
            whatsappId,
            cart,
            structuredReply,
        );

        if (
            cart.items.length > 0 &&
            (cart.deliveryAddress?.trim() ||
                cart.deliveryType === DeliveryType.PICKUP)
        ) {
            await this.deliveryOrderService.syncPendingOrderFromCart({
                ownerUserId,
                instanceId,
                whatsappId,
                deliveryAddress: cart.deliveryAddress,
            });
        }

        return { cart, appliedOperations };
    }

    private async applyStructuredCheckoutContext(
        whatsappId: string,
        cart: TemporaryCart,
        structuredReply?: Pick<
            GroceryAiStructuredResponse,
            "deliveryType" | "paymentMethod" | "changeFor" | "wantsChange"
        >,
    ): Promise<TemporaryCart> {
        if (!structuredReply) {
            return cart;
        }

        const shouldClearChangeAmount =
            structuredReply.wantsChange === false ||
            structuredReply.paymentMethod === PaymentMethod.CARD_DELIVERY ||
            structuredReply.paymentMethod === PaymentMethod.PIX_DELIVERY ||
            structuredReply.paymentMethod === PaymentMethod.PIX_ONLINE;
        const nextChangeAmount = shouldClearChangeAmount
            ? structuredReply.wantsChange === false
                ? 0
                : null
            : structuredReply.changeFor;
        const hasCheckoutUpdates =
            structuredReply.deliveryType !== undefined ||
            structuredReply.paymentMethod !== undefined ||
            structuredReply.changeFor !== undefined ||
            structuredReply.wantsChange !== undefined;

        if (!hasCheckoutUpdates) {
            return cart;
        }

        return this.temporaryCartService.setCheckoutContext(whatsappId, {
            deliveryType: structuredReply.deliveryType,
            paymentMethod: structuredReply.paymentMethod,
            changeAmount: nextChangeAmount,
        });
    }

    private buildWhatsappReplyText(input: {
        fallbackReplyText?: string;
        appliedOperations: AppliedCartOperation[];
        cart: TemporaryCart;
        skipConfirmationQuestion?: boolean;
        relatedProducts: Product[];
    }): string {
        if (input.appliedOperations.length > 0) {
            const confirmation = this.buildCartConfirmationText(
                input.appliedOperations,
                input.cart,
                input.skipConfirmationQuestion,
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
        skipConfirmationQuestion: boolean = false,
    ): string {
        const appliedSummary = this.joinHumanList(
            operations.map(
                (operation) => `${operation.quantity}x ${operation.title}`,
            ),
        );
        const cartSummary = this.buildCartItemsSummary(cart);
        const confirmationQuestion = skipConfirmationQuestion
            ? ""
            : " Confirma pra mim se as quantidades estão certas?";

        if (
            cart.items.length > operations.length ||
            cart.items.some(
                (item) =>
                    !operations.some(
                        (operation) => operation.productId === item.productId,
                    ),
            )
        ) {
            return `Perfeito! Adicionei ${appliedSummary}. Seu carrinho agora está com ${cartSummary}.${confirmationQuestion}`.trim();
        }

        return `Perfeito! Separei ${appliedSummary}.${confirmationQuestion}`.trim();
    }

    private buildCartConfirmedReplyText(cart: TemporaryCart): string {
        const cartSummary = this.buildCartItemsSummary(cart);
        const totalsText = this.buildCartTotalsText(cart);

        if (cart.deliveryType === DeliveryType.PICKUP) {
            return `Perfeito! Seu carrinho está com ${cartSummary}. ${totalsText} Retirada no local selecionada. Se estiver tudo certo, posso finalizar o pedido.`;
        }

        if (cart.deliveryAddress?.trim()) {
            return `Perfeito! Seu carrinho está com ${cartSummary}. ${totalsText} Entrega em ${cart.deliveryAddress}. Se estiver tudo certo, posso finalizar o pedido.`;
        }

        return `Perfeito! Seu carrinho está com ${cartSummary}. ${totalsText} Se quiser, posso adicionar mais itens ou você pode me mandar o endereço para entrega.`;
    }

    private buildDelayedCartConfirmationText(cart: TemporaryCart): string {
        return `Seu carrinho agora está com ${this.buildCartItemsSummary(
            cart,
        )}. Confirma pra mim se as quantidades estão certas?`;
    }

    private buildAddressCapturedReplyText(cart: TemporaryCart): string {
        const cartSummary = this.buildCartItemsSummary(cart);
        const totalsText = this.buildCartTotalsText(cart);

        if (cart.deliveryType === DeliveryType.PICKUP) {
            return `Retirada no local anotada. O pedido ficou em ${cartSummary}. ${totalsText} Posso finalizar o pedido?`;
        }

        return `Endereco anotado: ${cart.deliveryAddress}. O pedido ficou em ${cartSummary}. ${totalsText} Posso finalizar o pedido?`;
    }

    private buildReadyToFinalizeReplyText(cart: TemporaryCart): string {
        const cartSummary = this.buildCartItemsSummary(cart);
        const totalText = this.formatPrice(cart.totalCents);

        if (cart.deliveryType === DeliveryType.PICKUP) {
            return `Certo! Entao o pedido e ${cartSummary} para retirada no local. O total e ${totalText}. Posso finalizar o pedido?`;
        }

        return `Certo! Entao o pedido e ${cartSummary} para entrega em ${cart.deliveryAddress}. O total e ${totalText}. Posso finalizar o pedido?`;
    }

    private buildAddressRequestReplyText(cart: TemporaryCart): string {
        const cartSummary = this.buildCartItemsSummary(cart);
        const totalsText = this.buildCartTotalsText(cart);

        if (cart.deliveryType === DeliveryType.PICKUP) {
            return `Perfeito! Fico com ${cartSummary}. ${totalsText} Retirada no local selecionada. Se estiver tudo certo, posso finalizar o pedido.`;
        }

        return `Perfeito! Fico com ${cartSummary}. ${totalsText} Agora me manda o endereco para entrega, por favor.`;
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
        instanceId: string;
        chatId: string;
        cart: TemporaryCart;
        intent?: GroceryIntent;
    }) {
        if (
            input.intent !== "FINALIZE_ORDER" ||
            !input.cart.items.length ||
            (input.cart.deliveryType !== DeliveryType.PICKUP &&
                !input.cart.deliveryAddress?.trim())
        ) {
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
        const totalText = this.formatPrice(cart.totalCents);

        if (cart.deliveryType === DeliveryType.PICKUP) {
            return `Pedido confirmado! Enviei ${summary} para preparo. Total do pedido: ${totalText}. Assim que estiver pronto para retirada eu te aviso por aqui.`;
        }

        return `Pedido confirmado! Enviei ${summary} para preparo e entrega em ${cart.deliveryAddress}. Total do pedido: ${totalText}. Assim que sair com o motoboy eu te aviso por aqui.`;
    }

    private async resolveWhatsappCheckoutDecision(input: {
        instanceId: string;
        chatId: string;
        ownerUserId: string;
        cart: TemporaryCart;
        intent?: GroceryIntent;
        checkoutSettings: OwnerCheckoutSettings;
    }): Promise<CheckoutDecision | null> {
        if (input.intent !== "FINALIZE_ORDER") {
            return null;
        }

        if (!input.cart.items.length) {
            return null;
        }

        const availableDeliveryTypes =
            this.resolveAvailableDeliveryTypes(input.checkoutSettings);
        const acceptedPaymentMethods =
            this.resolveAcceptedPaymentMethods(input.checkoutSettings);

        if (
            !input.cart.deliveryType ||
            !availableDeliveryTypes.includes(input.cart.deliveryType)
        ) {
            return {
                finalizeNow: false,
                text: this.buildDeliveryTypeSelectionReply(
                    input.checkoutSettings,
                ),
            };
        }

        if (input.cart.deliveryType === DeliveryType.DELIVERY) {
            if (!input.cart.paymentMethod) {
                return {
                    finalizeNow: false,
                    text: this.buildPaymentMethodSelectionReply(
                        input.checkoutSettings,
                    ),
                };
            }

            if (!acceptedPaymentMethods.includes(input.cart.paymentMethod)) {
                return {
                    finalizeNow: false,
                    text: this.buildPaymentMethodSelectionReply(
                        input.checkoutSettings,
                    ),
                };
            }

            if (!input.cart.deliveryAddress?.trim()) {
                return {
                    finalizeNow: false,
                    text: this.buildAddressRequestReplyText(input.cart),
                };
            }

            if (
                input.cart.paymentMethod === PaymentMethod.CASH &&
                input.cart.changeAmount === null
            ) {
                return {
                    finalizeNow: false,
                    text: "Perfeito! O pagamento vai ser em dinheiro. Voce precisa de troco? Se sim, me diga para quanto.",
                };
            }

            if (input.cart.paymentMethod === PaymentMethod.PIX_ONLINE) {
                return {
                    finalizeNow: false,
                    text: await this.buildPixOnlineCheckoutReply(input),
                };
            }

            if (input.cart.paymentMethod === PaymentMethod.PIX_DELIVERY) {
                return {
                    finalizeNow: true,
                    text: `Pedido confirmado! Vou seguir com ${this.buildCartItemsSummary(
                        input.cart,
                    )} para entrega em ${input.cart.deliveryAddress}. O total ficou em ${this.formatPrice(
                        input.cart.totalCents,
                    )}. O entregador vai levar o QR Code do Pix para voce pagar no ato da entrega.`,
                };
            }

            if (input.cart.paymentMethod === PaymentMethod.CARD_DELIVERY) {
                return {
                    finalizeNow: true,
                    text: `Pedido confirmado! Vou seguir com ${this.buildCartItemsSummary(
                        input.cart,
                    )} para entrega em ${input.cart.deliveryAddress}. O total ficou em ${this.formatPrice(
                        input.cart.totalCents,
                    )}. O entregador vai levar a maquininha para o pagamento na entrega.`,
                };
            }

            if (input.cart.paymentMethod === PaymentMethod.CASH) {
                const changeText =
                    input.cart.changeAmount && input.cart.changeAmount > 0
                        ? ` Vou separar o troco para ${this.formatFloatAsPrice(
                              input.cart.changeAmount,
                          )}.`
                        : " Sem necessidade de troco.";

                return {
                    finalizeNow: true,
                    text: `Pedido confirmado! Vou seguir com ${this.buildCartItemsSummary(
                        input.cart,
                    )} para entrega em ${input.cart.deliveryAddress}. O total ficou em ${this.formatPrice(
                        input.cart.totalCents,
                    )}.${changeText}`,
                };
            }
        }

        if (input.cart.deliveryType === DeliveryType.PICKUP) {
            if (
                input.cart.paymentMethod &&
                !acceptedPaymentMethods.includes(input.cart.paymentMethod)
            ) {
                return {
                    finalizeNow: false,
                    text: this.buildPaymentMethodSelectionReply(
                        input.checkoutSettings,
                    ),
                };
            }

            if (input.cart.paymentMethod === PaymentMethod.PIX_ONLINE) {
                return {
                    finalizeNow: false,
                    text: await this.buildPixOnlineCheckoutReply(input),
                };
            }

            return {
                finalizeNow: true,
                text: this.buildPickupCheckoutReply(
                    input.cart,
                    input.checkoutSettings,
                ),
            };
        }

        return null;
    }

    private resolveAvailableDeliveryTypes(
        settings: OwnerCheckoutSettings,
    ): DeliveryType[] {
        return settings.availableDeliveryTypes.length
            ? settings.availableDeliveryTypes
            : [DeliveryType.DELIVERY];
    }

    private resolveAcceptedPaymentMethods(
        settings: OwnerCheckoutSettings,
    ): PaymentMethod[] {
        return settings.acceptedPaymentMethods.length
            ? settings.acceptedPaymentMethods
            : [PaymentMethod.PIX_ONLINE];
    }

    private buildDeliveryTypeSelectionReply(
        settings: OwnerCheckoutSettings,
    ): string {
        const availableTypes = this.resolveAvailableDeliveryTypes(settings);

        if (availableTypes.length === 1) {
            return `Antes de fechar, me confirma se vamos seguir com ${this.describeDeliveryType(
                availableTypes[0],
            )}.`;
        }

        return `Antes de fechar, me diz como voce prefere receber: ${this.joinHumanList(
            availableTypes.map((type) => this.describeDeliveryType(type)),
        )}.`;
    }

    private buildPaymentMethodSelectionReply(
        settings: OwnerCheckoutSettings,
    ): string {
        const acceptedMethods = this.resolveAcceptedPaymentMethods(settings);

        return `Perfeito! Agora me confirma a forma de pagamento. Hoje aceitamos ${this.joinHumanList(
            acceptedMethods.map((method) => this.describePaymentMethod(method)),
        )}.`;
    }

    private async buildPixOnlineCheckoutReply(input: {
        instanceId: string;
        chatId: string;
        ownerUserId: string;
        cart: TemporaryCart;
        checkoutSettings: OwnerCheckoutSettings;
    }): Promise<string> {
        await this.deliveryOrderService.syncPendingOrderFromCart({
            ownerUserId: input.ownerUserId,
            instanceId: input.instanceId,
            whatsappId: input.chatId,
            deliveryAddress: input.cart.deliveryAddress,
        });

        const pixCharge = await this.syncPayService.createCharge({
            amountCents: input.cart.totalCents,
            productTitle: this.buildPixOrderTitle(input.cart),
            referenceId: `${input.instanceId}-${input.chatId}-${Date.now()}`,
        });

        await this.deliveryOrderService.setPendingOrderPixPayload({
            instanceId: input.instanceId,
            whatsappId: input.chatId,
            pixPayload: pixCharge.pix_code,
        });

        const fulfillmentText =
            input.cart.deliveryType === DeliveryType.PICKUP
                ? this.buildPickupLocationText(input.checkoutSettings)
                : `Entrega em ${input.cart.deliveryAddress}.`;

        return `Perfeito! Gerei o Pix online do seu pedido. ${fulfillmentText} Total: ${this.formatPrice(
            input.cart.totalCents,
        )}. Copia e cola do Pix:\n${pixCharge.pix_code}\nAssim que o pagamento for confirmado, eu sigo com o preparo.`;
    }

    private buildPickupCheckoutReply(
        cart: TemporaryCart,
        settings: OwnerCheckoutSettings,
    ): string {
        const acceptedMethods = this.resolveAcceptedPaymentMethods(settings);
        const hasPixOnline = acceptedMethods.includes(PaymentMethod.PIX_ONLINE);
        const hasPhysicalPayment = acceptedMethods.some(
            (method) =>
                method === PaymentMethod.CASH ||
                method === PaymentMethod.CARD_DELIVERY ||
                method === PaymentMethod.PIX_DELIVERY,
        );
        const paymentText =
            hasPixOnline && hasPhysicalPayment
                ? "O pagamento pode ser feito na retirada ou via Pix online, se voce preferir."
                : hasPixOnline
                  ? "O pagamento deve ser feito via Pix online."
                  : "O pagamento deve ser feito na retirada.";

        return `Pedido confirmado! Vou preparar ${this.buildCartItemsSummary(
            cart,
        )} para retirada no local. ${paymentText} ${this.buildPickupLocationText(
            settings,
        )}`;
    }

    private buildPickupLocationText(settings: OwnerCheckoutSettings): string {
        const establishmentName = settings.establishmentName.trim();
        const fallbackAddress =
            this.configService.get<string>("DEFAULT_PICKUP_ADDRESS")?.trim() ||
            null;
        const establishmentAddress =
            settings.establishmentAddress?.trim() || fallbackAddress;

        if (establishmentAddress) {
            return `Retirada em ${establishmentName}. Endereco: ${establishmentAddress}.`;
        }

        return `Retirada em ${establishmentName}. O endereco do estabelecimento ainda nao esta configurado no sistema.`;
    }

    private buildPixOrderTitle(cart: TemporaryCart): string {
        const summary = this.buildCartItemsSummary(cart);
        const compactSummary =
            summary.length > 80 ? `${summary.slice(0, 77)}...` : summary;

        return `Pedido WhatsApp - ${compactSummary}`;
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
        catalogProducts: DeliveryCatalogProduct[],
        anchorProducts: DeliveryCatalogProduct[],
        currentCart: TemporaryCart,
        suggestedProductIds: string[] = [],
    ): DeliveryCatalogProduct[] {
        const relatedProducts: DeliveryCatalogProduct[] = [];
        const excludedIds = new Set<string>([
            ...anchorProducts.map((product) => product.id),
            ...currentCart.items.map((item) => item.productId),
        ]);
        const catalogById = new Map(
            catalogProducts.map((product) => [product.id, product]),
        );
        const pushProduct = (product?: DeliveryCatalogProduct | null) => {
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
                    ...this.getDeliveryProductTagNames(sourceProduct),
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
                                ...this.getDeliveryProductTagNames(product),
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
        catalogProducts: DeliveryCatalogProduct[],
        matchedProducts: ProductSearchResult[],
    ): DeliveryCatalogProduct[] {
        const matchedIds = new Set(matchedProducts.map((product) => product.id));
        return catalogProducts.filter((product) => matchedIds.has(product.id));
    }

    private resolveCartProducts(
        catalogProducts: DeliveryCatalogProduct[],
        cart: TemporaryCart,
    ): DeliveryCatalogProduct[] {
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
            const intent = this.normalizeGroceryIntent(parsed.intent);
            const replyText =
                typeof parsed.replyText === "string"
                    ? parsed.replyText.trim()
                    : rawText.trim();

            return {
                intent,
                replyText,
                paymentMethod: this.normalizeGroceryPaymentMethod(
                    parsed.paymentMethod,
                ),
                wantsChange:
                    typeof parsed.wantsChange === "boolean"
                        ? parsed.wantsChange
                        : undefined,
                changeFor: this.normalizeStructuredNumber(parsed.changeFor),
                deliveryType: this.normalizeGroceryDeliveryType(
                    parsed.deliveryType,
                ),
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
                intent: "GENERAL_INQUIRY",
                replyText: rawText.trim(),
                paymentMethod: undefined,
                wantsChange: undefined,
                changeFor: undefined,
                deliveryType: undefined,
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

    private normalizeGroceryIntent(value: unknown): GroceryIntent {
        if (typeof value !== "string") {
            return "GENERAL_INQUIRY";
        }

        const normalized = value.trim().toUpperCase();

        if (
            normalized === "ADD_TO_CART" ||
            normalized === "REMOVE_FROM_CART" ||
            normalized === "ASK_DELIVERY_TYPE" ||
            normalized === "SELECT_PAYMENT_METHOD" ||
            normalized === "FINALIZE_ORDER" ||
            normalized === "GENERAL_INQUIRY"
        ) {
            return normalized;
        }

        return "GENERAL_INQUIRY";
    }

    private normalizeGroceryPaymentMethod(
        value: unknown,
    ): PaymentMethod | undefined {
        if (typeof value !== "string") {
            return undefined;
        }

        const normalized = value.trim().toUpperCase();

        if (
            normalized === "PIX_ONLINE" ||
            normalized === "PIX_DELIVERY" ||
            normalized === "CARD_DELIVERY" ||
            normalized === "CASH"
        ) {
            return normalized;
        }

        return undefined;
    }

    private normalizeGroceryDeliveryType(
        value: unknown,
    ): DeliveryType | undefined {
        if (typeof value !== "string") {
            return undefined;
        }

        const normalized = value.trim().toUpperCase();

        if (normalized === "DELIVERY" || normalized === "PICKUP") {
            return normalized;
        }

        return undefined;
    }

    private normalizeStructuredNumber(value: unknown): number | undefined {
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === "string") {
            const normalized = Number(value.trim().replace(",", "."));

            if (Number.isFinite(normalized)) {
                return normalized;
            }
        }

        return undefined;
    }

    private buildCatalogLine(product: DeliveryCatalogProduct): string {
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
        const tags = this.getDeliveryProductTagNames(product);
        const effectivePriceCents = getEffectiveProductPriceCents(product);
        const promotionalLabel = hasValidPromotionalPrice(product)
            ? ` (de ${this.formatPrice(product.priceCents)})`
            : "";

        return `- id: ${product.id} | nome: ${product.title} | preco: ${this.formatPrice(effectivePriceCents)}${promotionalLabel} [${tags.length ? tags.join(", ") : "sem tags"}] | ${stockText}${category}${description}`;
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
        const tags = product.tags
            .map((tag) => tag.trim())
            .filter(Boolean);
        const promotionalLabel =
            typeof product.promotionalPriceCents === "number" &&
            product.promotionalPriceCents > 0 &&
            product.promotionalPriceCents < product.basePriceCents
                ? ` (de ${this.formatPrice(product.basePriceCents)})`
                : "";

        return `- id: ${product.id} | nome: ${product.title} | preco: ${this.formatPrice(product.priceCents)}${promotionalLabel} [${tags.length ? tags.join(", ") : "sem tags"}] | ${stockText}${category}${description}`;
    }

    private getDeliveryProductTagNames(
        product: DeliveryCatalogProduct,
    ): string[] {
        return product.productTags
            .map((entry) => entry.tag.name.trim())
            .filter(Boolean);
    }

    private buildCartContext(cart: TemporaryCart): string {
        const lines = cart.items.length
            ? [
                  ...cart.items.map((item) => this.buildCartItemLine(item)),
                  ...this.buildCartTotalsContextLines(cart),
              ]
            : ["- Carrinho vazio."];

        return [
            ...lines,
            `- Tipo de entrega: ${this.describeCartDeliveryTypeForContext(cart)}`,
            `- Forma de pagamento: ${this.describeCartPaymentMethodForContext(cart)}`,
            cart.changeAmount === 0
                ? "- Troco para: nao precisa"
                : typeof cart.changeAmount === "number"
                ? `- Troco para: ${this.formatFloatAsPrice(cart.changeAmount)}`
                : "- Troco para: nao informado",
            cart.deliveryType === DeliveryType.PICKUP
                ? "- Endereco de entrega: retirada no local"
                : cart.deliveryAddress
                  ? `- Endereco de entrega: ${cart.deliveryAddress}`
                  : "- Endereco de entrega: nao informado",
        ].join("\n");
    }

    private buildCartItemLine(item: TemporaryCartItem): string {
        return `- ${item.quantity}x ${item.title} | subtotal: ${this.formatPrice(item.subtotalCents)}`;
    }

    private buildCartTotalsContextLines(cart: TemporaryCart): string[] {
        if (cart.deliveryFeeCents > 0) {
            return [
                `- Subtotal dos itens: ${this.formatPrice(cart.subtotalCents)}`,
                `- Taxa de entrega: ${this.formatPrice(cart.deliveryFeeCents)}`,
                `- Total parcial: ${this.formatPrice(cart.totalCents)}`,
            ];
        }

        return [`- Total parcial: ${this.formatPrice(cart.totalCents)}`];
    }

    private buildCartTotalsText(cart: TemporaryCart): string {
        if (cart.deliveryFeeCents > 0) {
            return `Subtotal dos itens: ${this.formatPrice(cart.subtotalCents)}. Taxa de entrega: ${this.formatPrice(cart.deliveryFeeCents)}. Total parcial: ${this.formatPrice(cart.totalCents)}.`;
        }

        return `Total parcial: ${this.formatPrice(cart.totalCents)}.`;
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

    private formatFloatAsPrice(value: number): string {
        return `R$ ${value.toFixed(2).replace(".", ",")}`;
    }

    private describeCartDeliveryTypeForContext(cart: TemporaryCart): string {
        if (cart.deliveryType === DeliveryType.PICKUP) {
            return "retirada no local";
        }

        if (cart.deliveryType === DeliveryType.DELIVERY) {
            return "entrega";
        }

        return "nao informado";
    }

    private describeDeliveryType(type: DeliveryType): string {
        if (type === DeliveryType.PICKUP) {
            return "retirada no local";
        }

        return "entrega";
    }

    private describeCartPaymentMethodForContext(cart: TemporaryCart): string {
        switch (cart.paymentMethod) {
            case PaymentMethod.PIX_ONLINE:
                return "pix online";
            case PaymentMethod.PIX_DELIVERY:
                return "pix na entrega";
            case PaymentMethod.CARD_DELIVERY:
                return "cartao na entrega";
            case PaymentMethod.CASH:
                return "dinheiro na entrega";
            default:
                return "nao informado";
        }
    }

    private describePaymentMethod(method: PaymentMethod): string {
        switch (method) {
            case PaymentMethod.PIX_ONLINE:
                return "pix online";
            case PaymentMethod.PIX_DELIVERY:
                return "pix na entrega";
            case PaymentMethod.CARD_DELIVERY:
                return "cartao na entrega";
            case PaymentMethod.CASH:
                return "dinheiro na entrega";
            default:
                return method;
        }
    }

    private maybeBuildDeterministicWhatsappReply(input: {
        messageText: string;
        cart: TemporaryCart;
        latestAssistantMessage: string | null;
        addressJustCaptured: boolean;
    }): string | null {
        if (!input.cart.items.length) {
            return null;
        }

        const hasFulfillmentInfo =
            input.cart.deliveryType === DeliveryType.PICKUP ||
            Boolean(input.cart.deliveryAddress?.trim());
        const readyToFinalize =
            hasFulfillmentInfo &&
            (this.hasStrongFinalizeCue(input.messageText) ||
                ((this.isSimpleCartConfirmationIntent(input.messageText) ||
                    this.isNoMoreItemsIntent(input.messageText)) &&
                    (this.didAssistantAskCartConfirmation(
                        input.latestAssistantMessage,
                    ) ||
                        this.didAssistantAskToFinalize(
                            input.latestAssistantMessage,
                        ))));

        if (readyToFinalize) {
            return null;
        }

        if (
            input.addressJustCaptured &&
            input.cart.deliveryAddress?.trim() &&
            !this.hasStrongFinalizeCue(input.messageText)
        ) {
            return this.buildAddressCapturedReplyText(input.cart);
        }

        if (
            this.isNoMoreItemsIntent(input.messageText) &&
            this.didAssistantAskCartConfirmation(input.latestAssistantMessage)
        ) {
            if (hasFulfillmentInfo) {
                return this.buildReadyToFinalizeReplyText(input.cart);
            }

            return this.buildAddressRequestReplyText(input.cart);
        }

        if (this.isSimpleCartConfirmationIntent(input.messageText)) {
            return this.buildCartConfirmedReplyText(input.cart);
        }

        if (
            this.isNoMoreItemsIntent(input.messageText) &&
            this.didAssistantAskAboutMoreItems(input.latestAssistantMessage)
        ) {
            if (hasFulfillmentInfo) {
                return this.buildReadyToFinalizeReplyText(input.cart);
            }

            return this.buildAddressRequestReplyText(input.cart);
        }

        return null;
    }

    private hasStrongFinalizeCue(messageText: string): boolean {
        const normalized = this.normalizeText(messageText)
            .replace(/[!?.,]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return [
            "ja falei para finalizar",
            "ja falei pra finalizar",
            "finaliza",
            "finalizar",
            "fechar pedido",
            "pode fechar",
            "quero finalizar",
            "concluir pedido",
            "ja pode mandar",
            "pode mandar",
            "pode entregar",
            "manda pra mim",
        ].some((keyword) => normalized.includes(keyword));
    }

    private shouldSkipConfirmationQuestionForBatch(input: {
        messageText: string;
        appliedOperations: AppliedCartOperation[];
        debounceMessageCount: number | null;
    }): boolean {
        if (!input.appliedOperations.length) {
            return false;
        }

        const messageSegments = input.messageText
            .split(/\n+/)
            .map((segment) => segment.trim())
            .filter(Boolean);
        const debounceMessageCount = Math.max(
            input.debounceMessageCount ?? 1,
            messageSegments.length,
        );

        if (debounceMessageCount <= 1) {
            return false;
        }

        const latestSegment =
            messageSegments[messageSegments.length - 1] ?? input.messageText;

        if (
            this.isSimpleCartConfirmationIntent(latestSegment) ||
            this.isNoMoreItemsIntent(latestSegment) ||
            this.isWhatsappOrderConfirmationIntent(latestSegment)
        ) {
            return false;
        }

        return true;
    }

    private shouldDeferCartConfirmationQuestion(input: {
        messageText: string;
        latestAssistantMessage: string | null;
        appliedOperations: AppliedCartOperation[];
    }): boolean {
        if (!input.appliedOperations.length) {
            return false;
        }

        if (!this.didAssistantAskCartConfirmation(input.latestAssistantMessage)) {
            return false;
        }

        if (
            this.isSimpleCartConfirmationIntent(input.messageText) ||
            this.isNoMoreItemsIntent(input.messageText) ||
            this.isWhatsappOrderConfirmationIntent(input.messageText)
        ) {
            return false;
        }

        return true;
    }

    private isWhatsappOrderConfirmationIntent(messageText: string): boolean {
        const normalized = this.normalizeText(messageText)
            .replace(/[!?.,]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return [
            "fecha ai",
            "pode fechar",
            "fechar pedido",
            "fecha meu pedido",
            "pode finalizar",
            "encerra o pedido",
            "finaliza",
            "pedido confirmado",
            "confirmo",
            "manda pra mim",
            "fechou",
            "eh isso",
            "terminamos",
            "concluir pedido",
            "quero finalizar",
            "ja pode mandar",
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

        if (!normalized || normalized.length > 80) {
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
            "ta certo sim",
            "esta certo sim",
            "sim so isso",
            "sim so isso mesmo",
            "sim so isto",
            "sim so isto mesmo",
        ].includes(normalized)
            ? true
            : /^(sim|correto|isso mesmo|ta certo|esta certo|certo|ok|perfeito|confirmo)\b/.test(
                  normalized,
              );
    }

    private isNoMoreItemsIntent(messageText: string): boolean {
        const normalized = this.normalizeText(messageText)
            .replace(/[!?.,]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (!normalized || normalized.length > 80) {
            return false;
        }

        return [
            "nao",
            "nao so isso",
            "nao so isso mesmo",
            "nao so isto",
            "nao so isto mesmo",
            "so isso",
            "so isso mesmo",
            "somente isso",
            "apenas isso",
            "nada mais",
            "sim so isso",
            "sim so isso mesmo",
            "sim so isto",
            "sim so isto mesmo",
        ].includes(normalized)
            ? true
            : /(nao so isso|nao so isto|so isso|so isto|somente isso|apenas isso|nada mais)\b/.test(
                  normalized,
              );
    }

    private didAssistantAskCartConfirmation(
        latestAssistantMessage: string | null,
    ): boolean {
        if (!latestAssistantMessage?.trim()) {
            return false;
        }

        return this.normalizeText(latestAssistantMessage).includes(
            "confirma pra mim se as quantidades estao certas",
        );
    }

    private getLatestAssistantMessageContent(
        history: Array<{
            role: ChatMessageRole;
            content: string;
        }>,
    ): string | null {
        for (let index = history.length - 1; index >= 0; index -= 1) {
            const message = history[index];

            if (message.role === ChatMessageRole.model) {
                return message.content.trim();
            }
        }

        return null;
    }

    private didAssistantAskToFinalize(messageText: string | null): boolean {
        const normalized = this.normalizeText(messageText ?? "");

        return [
            "posso finalizar",
            "finalizar o pedido",
            "posso fechar o pedido",
            "pedido e",
        ].some((keyword) => normalized.includes(keyword));
    }

    private didAssistantAskAboutMoreItems(messageText: string | null): boolean {
        const normalized = this.normalizeText(messageText ?? "");

        return [
            "mais alguma coisa",
            "deseja adicionar",
            "posso adicionar mais",
            "quer mais algum item",
            "adicionar mais itens",
        ].some((keyword) => normalized.includes(keyword));
    }

    private async maybeCaptureDeliveryAddressFromText(input: {
        messageText: string;
        cart: TemporaryCart;
        chatId: string;
        instanceId: string;
        ownerUserId: string;
    }): Promise<{
        cart: TemporaryCart;
        wasCapturedFromCurrentMessage: boolean;
    }> {
        if (!input.cart.items.length) {
            return {
                cart: input.cart,
                wasCapturedFromCurrentMessage: false,
            };
        }

        const detectedAddress = this.extractDeliveryAddressFromText(
            input.messageText,
        );

        if (!detectedAddress) {
            return {
                cart: input.cart,
                wasCapturedFromCurrentMessage: false,
            };
        }

        const currentAddress = input.cart.deliveryAddress?.trim();

        if (
            currentAddress &&
            this.normalizeText(currentAddress) ===
                this.normalizeText(detectedAddress)
        ) {
            return {
                cart: input.cart,
                wasCapturedFromCurrentMessage: false,
            };
        }

        const updatedCart = await this.temporaryCartService.setDeliveryAddress(
            input.chatId,
            detectedAddress,
        );

        try {
            await this.deliveryOrderService.syncPendingOrderFromCart({
                ownerUserId: input.ownerUserId,
                instanceId: input.instanceId,
                whatsappId: input.chatId,
                deliveryAddress: detectedAddress,
            });
        } catch (error) {
            this.logger.warn(
                `[maybeCaptureDeliveryAddressFromText] falha ao sincronizar pedido instanceId=${input.instanceId} chatId=${input.chatId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        this.logger.debug(
            `[maybeCaptureDeliveryAddressFromText] endereco detectado instanceId=${input.instanceId} chatId=${input.chatId}`,
        );

        return {
            cart: updatedCart,
            wasCapturedFromCurrentMessage: true,
        };
    }

    private extractDeliveryAddressFromText(messageText: string): string | null {
        const raw = messageText.trim();

        if (!raw || raw.length < 8 || raw.length > 220) {
            return null;
        }

        const compact = raw.replace(/\s+/g, " ").trim();
        const normalized = this.normalizeText(compact);

        if (!/\d/.test(compact)) {
            return null;
        }

        const hasAddressKeyword = [
            "rua",
            "avenida",
            "av",
            "travessa",
            "alameda",
            "estrada",
            "rodovia",
            "bairro",
            "casa",
            "apto",
            "apartamento",
            "bloco",
            "quadra",
            "lote",
            "endereco",
            "numero",
            "n ",
        ].some((keyword) => normalized.includes(keyword));
        const hasAddressSeparator = /[\n,/-]/.test(raw);
        const hasTrailingStreetNumber = /\b\d{1,5}[a-z]?\b$/i.test(compact);
        const wordCount = compact.split(/\s+/).filter(Boolean).length;

        if (
            !hasAddressKeyword &&
            !hasAddressSeparator &&
            !(hasTrailingStreetNumber && wordCount >= 3)
        ) {
            return null;
        }

        if (wordCount < 2) {
            return null;
        }

        let cleaned = compact;
        let previousValue = "";

        while (cleaned !== previousValue) {
            previousValue = cleaned;
            cleaned = cleaned
                .replace(
                    /^(sim|nao|não|ok|perfeito|correto|isso mesmo|ta certo|tá certo|esta certo|está certo|valeu|obrigado|obrigada|oi|ola|olá|bom dia|boa tarde|boa noite)\b[\s,!.:-]*/i,
                    "",
                )
                .replace(
                    /^(so isso|só isso|so isso mesmo|só isso mesmo|so isto|só isto|somente isso|apenas isso|nada mais)\b[\s,!.:-]*/i,
                    "",
                )
                .replace(
                    /^(pode entregar|pode enviar|entrega|manda pra mim|ja pode mandar|já pode mandar|pode mandar)\b[\s,!.:-]*/i,
                    "",
                )
                .replace(
                    /^(no endereco|no endereço|para o endereco|para o endereço|meu endereco e|meu endereço e|endereco|endereço)\b[\s,!.:-]*/i,
                    "",
                )
                .replace(
                    /^(na rua|na avenida|na av|na travessa|na alameda|na estrada|na rodovia)\b[\s,!.:-]*/i,
                    (match) => match.replace(/^na\s+/i, ""),
                )
                .trim();
        }

        cleaned = cleaned.replace(/^[,.;:\-]+/g, "").replace(/[.]{2,}$/g, ".").replace(/[ ,.;:\-]+$/g, "").trim();

        return cleaned.length >= 6 ? cleaned : compact;
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

    private isUnavailableWhatsappAudioTranscript(transcript: string): boolean {
        const normalized = this.normalizeText(transcript);

        if (!normalized) {
            return true;
        }

        if (normalized === "transcricao_indisponivel") {
            return true;
        }

        return [
            "nao tenho acesso a arquivos de audio",
            "nao tenho acesso a servicos de transcricao",
            "nao consigo transcrever",
            "nao foi possivel transcrever",
            "nao posso ouvir o audio",
            "i do not have access to audio files",
            "i cannot transcribe",
            "i cant transcribe",
        ].some((snippet) => normalized.includes(snippet));
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

    private getGenerativeModel(
        modelName: string,
        systemInstruction?: string,
        generationConfig?: GenerationConfig,
    ): GenerativeModel {
        const apiKey = this.configService.get<string>("GEMINI_API_KEY")?.trim();

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not configured");
        }

        if (!this.genAI) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }

        if (!this.hasLoggedAvailableModels) {
            void this.logAvailableModelsOnce();
        }

        return this.genAI.getGenerativeModel({
            model: modelName,
            ...(systemInstruction ? { systemInstruction } : {}),
            ...(generationConfig ? { generationConfig } : {}),
        });
    }

    private async logAvailableModelsOnce(): Promise<void> {
        if (this.hasLoggedAvailableModels) {
            return;
        }

        this.hasLoggedAvailableModels = true;

        try {
            const models = await this.listAvailableModels();
            const generateContentModels = models
                .filter((model) =>
                    (model.supportedGenerationMethods ?? []).includes(
                        "generateContent",
                    ),
                )
                .map((model) => this.normalizeApiModelName(model.name))
                .filter(Boolean)
                .sort((left, right) => left.localeCompare(right));

            this.logger.log(
                `[gemini-models] modelos disponiveis para generateContent (${generateContentModels.length}): ${generateContentModels.join(", ")}`,
            );

            this.logConfiguredModelAvailability(generateContentModels);
        } catch (error) {
            this.hasLoggedAvailableModels = false;
            this.logger.warn(
                `[gemini-models] nao foi possivel listar os modelos da API: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    private async listAvailableModels(): Promise<GeminiApiModel[]> {
        const apiKey = this.configService.get<string>("GEMINI_API_KEY")?.trim();

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not configured");
        }

        const response = await axios.get<{ models?: GeminiApiModel[] }>(
            "https://generativelanguage.googleapis.com/v1beta/models",
            {
                params: {
                    key: apiKey,
                },
                timeout: 15_000,
            },
        );

        return Array.isArray(response.data?.models) ? response.data.models : [];
    }

    private logConfiguredModelAvailability(availableModels: string[]): void {
        const availableSet = new Set(availableModels);
        const configuredModels = [
            this.getPrimaryModelName(),
            this.getFallbackModelName(),
            this.getWhatsappModelName(),
            this.getWhatsappFallbackModelName(),
            this.getTranscriptionModelName(),
            this.getTranscriptionFallbackModelName(),
        ]
            .filter(Boolean)
            .map((modelName) => String(modelName));
        const uniqueConfiguredModels = [...new Set(configuredModels)];

        this.logger.log(
            `[gemini-models] configurados no env: ${uniqueConfiguredModels.join(", ")}`,
        );

        const unavailableConfiguredModels = uniqueConfiguredModels.filter(
            (modelName) => !availableSet.has(this.normalizeApiModelName(modelName)),
        );

        if (unavailableConfiguredModels.length) {
            this.logger.warn(
                `[gemini-models] modelos configurados indisponiveis para esta chave/API: ${unavailableConfiguredModels.join(", ")}`,
            );
        }
    }

    private normalizeApiModelName(value?: string | null): string {
        return value?.replace(/^models\//, "").trim() || "";
    }

    private getBusinessProfile(
        botAccount: BotAccountWithOwnerSettings | null,
    ): BusinessProfile {
        return (
            botAccount?.ownerUser?.businessProfile ??
            botAccount?.businessProfile ??
            BusinessProfile.GROCERY
        );
    }

    private getBusinessProfilePromptConfig(
        businessProfile: BusinessProfile,
    ): BusinessProfilePromptConfig {
        switch (businessProfile) {
            case BusinessProfile.RESTAURANT:
                return {
                    profileLabel: "restaurant",
                    toneInstruction:
                        "Use a warm, appetizing, polished tone focused on practical conversion.",
                    systemInstructions: [
                        "Focus on selling lunch boxes, prato do dia, dishes, beverages, and sides from the runtime catalog.",
                        "Present meals in an appetizing way, but never invent ingredients or combinations that are not in the catalog.",
                        "When it helps conversion, suggest drink pairings, side dishes, or dessert add-ons from the real catalog.",
                    ],
                    runtimeCatalogTitle: "Cardapio ativo:",
                    emptyCatalogText: "- Nenhum item de restaurante ativo no momento",
                    runtimeMediaTitle:
                        "Midias ou exemplos ativos que podem apoiar a venda:",
                    emptyMediaText: "- Nenhuma midia ativa no momento",
                    runtimeInstructions: [
                        "- Se o cliente pedir sugestao, destaque marmitas, prato do dia e acompanhamentos reais do catalogo.",
                        "- Mantenha respostas objetivas e com apelo de sabor, sem exagerar.",
                    ],
                };
            case BusinessProfile.SNACK_BAR:
                return {
                    profileLabel: "snack bar",
                    toneInstruction:
                        "Use a quick, upbeat, casual tone with agile upsell suggestions.",
                    systemInstructions: [
                        "Focus on sandwiches, burgers, portions, additional toppings, and combos from the runtime catalog.",
                        "Help the customer montar o lanche with practical choices when those options exist in the catalog.",
                        "Suggest combos, add-ons, sauces, or drinks only when they exist in the runtime catalog.",
                    ],
                    runtimeCatalogTitle: "Cardapio de lanches ativo:",
                    emptyCatalogText: "- Nenhum item de lanchonete ativo no momento",
                    runtimeMediaTitle:
                        "Midias ou exemplos ativos que podem apoiar a venda:",
                    emptyMediaText: "- Nenhuma midia ativa no momento",
                    runtimeInstructions: [
                        "- Priorize agilidade, adicionais e combos reais do catalogo.",
                        "- Se o cliente estiver indeciso, puxe para uma escolha simples e facil de fechar.",
                    ],
                };
            case BusinessProfile.EVENT:
                return {
                    profileLabel: "event business",
                    toneInstruction:
                        "Use a professional, organized, more formal tone oriented to briefing and quotation.",
                    systemInstructions: [
                        "Focus on collecting data needed to prepare an event quote or proposal.",
                        "Prioritize event date, location, guest count, event type, and budget when those details are missing.",
                        "If the customer is still exploring, guide the conversation toward a complete briefing before promising a quote.",
                    ],
                    runtimeCatalogTitle: "Servicos e pacotes ativos:",
                    emptyCatalogText: "- Nenhum servico ou pacote ativo no momento",
                    runtimeMediaTitle:
                        "Midias ou exemplos ativos que podem apoiar a venda:",
                    emptyMediaText: "- Nenhuma midia ativa no momento",
                    runtimeInstructions: [
                        "- Se faltarem data, local, numero de convidados ou tipo de evento, peca essas informacoes antes de avancar.",
                        "- Seja mais formal e consultivo do que nos outros nichos.",
                    ],
                };
            case BusinessProfile.GROCERY:
            default:
                return {
                    profileLabel: "grocery store",
                    toneInstruction:
                        "Use a practical, friendly, neighborhood-store tone.",
                    systemInstructions: [
                        "Focus on grocery sales, stock awareness, and quantities such as kg, g, litro, pacote, caixa, or unidade when relevant.",
                        "Help the customer choose brand, size, or quantity only from the real runtime catalog.",
                        "When it helps conversion, suggest practical complementary products from the real catalog.",
                    ],
                    runtimeCatalogTitle: "Catalogo de produtos ativo:",
                    emptyCatalogText: "- Nenhum produto ativo no momento",
                    runtimeMediaTitle:
                        "Midias ou exemplos ativos que podem apoiar a venda:",
                    emptyMediaText: "- Nenhuma midia ativa no momento",
                    runtimeInstructions: [
                        "- Se o cliente perguntar sobre quantidade, unidade, ou disponibilidade, responda apenas com base no catalogo real.",
                        "- Use referencias a kg/un somente quando fizer sentido para o item real do catalogo.",
                    ],
                };
        }
    }

    private buildSystemPrompt(
        personaName: string,
        businessProfile: BusinessProfile,
    ): string {
        const profileConfig =
            this.getBusinessProfilePromptConfig(businessProfile);

        return [
            `Your name is ${personaName}.`,
            BUSINESS_SYSTEM_PROMPT,
            `Business profile: ${profileConfig.profileLabel}.`,
            profileConfig.toneInstruction,
            ...profileConfig.systemInstructions,
        ].join(" ");
    }

    private buildWhatsappSystemPrompt(
        personaName: string,
        businessProfile: BusinessProfile = BusinessProfile.GROCERY,
    ): string {
        const profileConfig =
            this.getBusinessProfilePromptConfig(businessProfile);

        return [
            `Your name is ${personaName}.`,
            GROCERY_SYSTEM_PROMPT,
            profileConfig.toneInstruction,
            ...profileConfig.systemInstructions,
        ].join(" ");
    }

    private getPrimaryModelName(): string {
        return (
            this.configService.get<string>("GEMINI_MODEL_PRIMARY")?.trim() ||
            this.configService.get<string>("GEMINI_MODEL")?.trim() ||
            AI_MODEL_NAME
        );
    }

    private getFallbackModelName(): string | null {
        return this.normalizeFallbackModelName(
            this.getPrimaryModelName(),
            this.configService.get<string>("GEMINI_MODEL_FALLBACK")?.trim() ||
                GEMINI_FALLBACK_MODEL_NAME,
        );
    }

    private getWhatsappModelName(): string {
        return (
            this.configService
                .get<string>("GEMINI_WHATSAPP_MODEL_PRIMARY")
                ?.trim() ||
            this.configService.get<string>("GEMINI_WHATSAPP_MODEL")?.trim() ||
            this.getPrimaryModelName() ||
            WHATSAPP_GROCERY_MODEL_NAME
        );
    }

    private getWhatsappFallbackModelName(): string | null {
        return (
            this.normalizeFallbackModelName(
                this.getWhatsappModelName(),
                this.configService
                    .get<string>("GEMINI_WHATSAPP_MODEL_FALLBACK")
                    ?.trim() ||
                    this.configService.get<string>("GEMINI_MODEL_FALLBACK")?.trim() ||
                    GEMINI_FALLBACK_MODEL_NAME,
            )
        );
    }

    private getTranscriptionModelName(): string {
        return (
            this.configService
                .get<string>("GEMINI_AUDIO_TRANSCRIPTION_MODEL_PRIMARY")
                ?.trim() ||
            this.configService
                .get<string>("GEMINI_AUDIO_TRANSCRIPTION_MODEL")
                ?.trim() ||
            this.getPrimaryModelName() ||
            WHATSAPP_AUDIO_TRANSCRIPTION_MODEL_NAME
        );
    }

    private getTranscriptionFallbackModelName(): string | null {
        return this.normalizeFallbackModelName(
            this.getTranscriptionModelName(),
            this.configService
                .get<string>("GEMINI_AUDIO_TRANSCRIPTION_MODEL_FALLBACK")
                ?.trim() ||
                this.configService.get<string>("GEMINI_MODEL_FALLBACK")?.trim() ||
                GEMINI_FALLBACK_MODEL_NAME,
        );
    }

    private normalizeFallbackModelName(
        primaryModelName: string,
        fallbackModelName?: string | null,
    ): string | null {
        const normalized = fallbackModelName?.trim() || null;

        if (!normalized || normalized === primaryModelName) {
            return null;
        }

        return normalized;
    }

    private getPrimaryCooldownMs(): number {
        const value = Number(
            this.configService.get<string>("GEMINI_PRIMARY_COOLDOWN_MS")?.trim() ||
                GEMINI_PRIMARY_COOLDOWN_MS,
        );

        return Number.isFinite(value) && value > 0
            ? Math.trunc(value)
            : GEMINI_PRIMARY_COOLDOWN_MS;
    }

    private getPrimaryRecoverySuccessCount(): number {
        const value = Number(
            this.configService
                .get<string>("GEMINI_PRIMARY_RECOVERY_SUCCESS_COUNT")
                ?.trim() || GEMINI_PRIMARY_RECOVERY_SUCCESS_COUNT,
        );

        return Number.isFinite(value) && value > 0
            ? Math.trunc(value)
            : GEMINI_PRIMARY_RECOVERY_SUCCESS_COUNT;
    }

    private async generateContentWithFallback<T>(input: {
        scope: AiModelScope;
        primaryModelName: string;
        fallbackModelName?: string | null;
        systemInstruction?: string;
        generationConfig?: GenerationConfig;
        request: (model: GenerativeModel) => Promise<T>;
    }): Promise<AiModelExecution<T>> {
        const fallbackModelName = this.normalizeFallbackModelName(
            input.primaryModelName,
            input.fallbackModelName,
        );
        const state = await this.getCircuitState(
            input.scope,
            input.primaryModelName,
        );
        const now = Date.now();

        if (state.openUntilMs > now && fallbackModelName) {
            this.logger.debug(
                `[gemini-circuit] primary em cooldown scope=${input.scope} model=${input.primaryModelName} openUntil=${state.openUntilMs}; usando fallback=${fallbackModelName}`,
            );

            const result = await input.request(
                this.getGenerativeModel(
                    fallbackModelName,
                    input.systemInstruction,
                    input.generationConfig,
                ),
            );

            return {
                result,
                modelName: fallbackModelName,
            };
        }

        try {
            const result = await input.request(
                this.getGenerativeModel(
                    input.primaryModelName,
                    input.systemInstruction,
                    input.generationConfig,
                ),
            );

            await this.registerPrimarySuccess(
                input.scope,
                input.primaryModelName,
                state,
            );

            return {
                result,
                modelName: input.primaryModelName,
            };
        } catch (error) {
            if (!fallbackModelName || !isAiServiceBusyError(error)) {
                throw error;
            }

            await this.openPrimaryCircuit(
                input.scope,
                input.primaryModelName,
                this.extractAiBusyReason(error),
            );

            const fallbackResult = await input.request(
                this.getGenerativeModel(
                    fallbackModelName,
                    input.systemInstruction,
                    input.generationConfig,
                ),
            );

            return {
                result: fallbackResult,
                modelName: fallbackModelName,
            };
        }
    }

    private async getCircuitState(
        scope: AiModelScope,
        primaryModelName: string,
    ): Promise<AiCircuitState> {
        const key = this.buildCircuitKey(scope, primaryModelName);

        try {
            const raw = await this.redis.hgetall(key);
            if (!Object.keys(raw).length) {
                return {
                    exists: false,
                    openUntilMs: 0,
                    recoverySuccessCount: 0,
                };
            }

            return {
                exists: true,
                openUntilMs: Number(raw.openUntilMs ?? 0) || 0,
                recoverySuccessCount:
                    Number(raw.recoverySuccessCount ?? 0) || 0,
            };
        } catch (error) {
            this.logger.debug(
                `[gemini-circuit] falha ao consultar estado no Redis: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );

            return {
                exists: false,
                openUntilMs: 0,
                recoverySuccessCount: 0,
            };
        }
    }

    private async registerPrimarySuccess(
        scope: AiModelScope,
        primaryModelName: string,
        state: AiCircuitState,
    ): Promise<void> {
        if (!state.exists) {
            return;
        }

        const now = Date.now();
        if (state.openUntilMs > now) {
            return;
        }

        const key = this.buildCircuitKey(scope, primaryModelName);
        const nextSuccessCount = state.recoverySuccessCount + 1;
        const targetSuccessCount = this.getPrimaryRecoverySuccessCount();

        try {
            if (nextSuccessCount >= targetSuccessCount) {
                await this.redis.del(key);
                this.logger.log(
                    `[gemini-circuit] primary recuperado scope=${scope} model=${primaryModelName}; voltando ao modelo principal`,
                );
                return;
            }

            await this.redis.hset(key, {
                openUntilMs: "0",
                recoverySuccessCount: String(nextSuccessCount),
            });
            await this.redis.pexpire(key, this.getPrimaryCooldownMs() * 2);

            this.logger.debug(
                `[gemini-circuit] recuperacao em andamento scope=${scope} model=${primaryModelName} success=${nextSuccessCount}/${targetSuccessCount}`,
            );
        } catch (error) {
            this.logger.debug(
                `[gemini-circuit] falha ao registrar sucesso do primary: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    private async openPrimaryCircuit(
        scope: AiModelScope,
        primaryModelName: string,
        reason: string,
    ): Promise<void> {
        const cooldownMs = this.getPrimaryCooldownMs();
        const key = this.buildCircuitKey(scope, primaryModelName);

        try {
            await this.redis.hset(key, {
                openUntilMs: String(Date.now() + cooldownMs),
                recoverySuccessCount: "0",
            });
            await this.redis.pexpire(key, cooldownMs * 2);
        } catch (error) {
            this.logger.debug(
                `[gemini-circuit] falha ao abrir circuito do primary: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        this.logger.warn(
            `[gemini-circuit] primary indisponivel scope=${scope} model=${primaryModelName}; ativando cooldown de ${cooldownMs}ms. motivo=${reason}`,
        );
    }

    private buildCircuitKey(
        scope: AiModelScope,
        primaryModelName: string,
    ): string {
        const safeModelName = primaryModelName.replace(/[^a-zA-Z0-9:_-]/g, "_");
        return `${GEMINI_CIRCUIT_KEY_PREFIX}:${scope}:${safeModelName}`;
    }

    private extractAiBusyReason(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private buildRuntimeContext(
        personaName: string,
        products: Product[],
        previewTemplates: PreviewTemplate[],
        businessProfile: BusinessProfile,
    ): string {
        const profileConfig =
            this.getBusinessProfilePromptConfig(businessProfile);
        const productLines = products.length
            ? products
                  .map((product) => {
                      const effectivePriceCents =
                          getEffectiveProductPriceCents(product);
                      const price = (effectivePriceCents / 100)
                          .toFixed(2)
                          .replace(".", ",");
                      const description = product.description?.trim()
                          ? ` | descricao: ${product.description.trim()}`
                          : "";
                      const promotionalHint = hasValidPromotionalPrice(product)
                          ? ` | preco original: ${this.formatPrice(product.priceCents)}`
                          : "";

                      return `- ${product.title} | preco: R$ ${price}${promotionalHint}${description}`;
                  })
                  .join("\n")
            : profileConfig.emptyCatalogText;

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
            : profileConfig.emptyMediaText;

        return [
            "CATALOGO_ATUAL",
            `Nome da persona: ${personaName}`,
            `Perfil de negocio: ${profileConfig.profileLabel}`,
            profileConfig.runtimeCatalogTitle,
            productLines,
            "",
            profileConfig.runtimeMediaTitle,
            previewLines,
            "",
            "INSTRUCOES",
            "- Liste produtos, servicos, pratos, combos, ou pacotes somente a partir da secao de catalogo ativo.",
            "- Se nao houver midia ou exemplo relevante, nao diga que vai enviar.",
            "- Se o cliente pedir preco, opcoes, cardapio, pacote, ou servico, apresente somente os itens reais do catalogo.",
            "- Se o cliente escolher claramente um item real, confirme de forma natural e conduza para o proximo passo comercial sem inventar dados.",
            "- Se o cliente pedir previa, foto, video, audio, amostra, cardapio, ou exemplo, responda de forma natural e considere uma midia compativel quando houver.",
            ...profileConfig.runtimeInstructions,
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

    private getPersonaName(botAccount: BotAccountWithOwnerSettings | null): string {
        const rawName =
            botAccount?.ownerUser?.assistantName?.trim() ||
            botAccount?.name?.trim() ||
            botAccount?.ownerUser?.name?.trim();
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
