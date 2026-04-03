import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    BotAccount,
    ChatMessageRole,
    MediaType,
    MessageDirection,
    MessageTemplate,
    MessageTemplateMedia,
    Product,
} from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Queue } from "bullmq";
import { AiAgentRepository } from "./ai-agent.repository";
import { SubscriptionService } from "../subscription/subscription.service";

export const AI_RESPONSE_QUEUE_NAME = "ai-response";
export const AI_RESPONSE_JOB_NAME = "generate-ai-response";

const AI_MODEL_NAME = "gemini-2.5-flash";
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
}

export interface AiDontSellRequest {
    botId: string;
    telegramId: string;
    leadFirstName?: string | null;
    anchorTemplateText?: string | null;
}

type PreviewTemplate = MessageTemplate & {
    mediaItems: MessageTemplateMedia[];
};

@Injectable()
export class AiAgentService {
    private readonly logger = new Logger(AiAgentService.name);
    private genAI?: GoogleGenerativeAI;

    constructor(
        private readonly configService: ConfigService,
        private readonly repository: AiAgentRepository,
        private readonly subscriptionService: SubscriptionService,
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
        };
    }

    async saveModelMessage(
        botId: string,
        telegramId: string,
        content: string,
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

    private getModel(personaName: string) {
        const apiKey = this.configService.get<string>("GEMINI_API_KEY")?.trim();

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY is not configured");
        }

        if (!this.genAI) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }

        return this.genAI.getGenerativeModel({
            model: this.getModelName(),
            systemInstruction: this.buildSystemPrompt(personaName),
        });
    }

    private buildSystemPrompt(personaName: string): string {
        return AI_SYSTEM_PROMPT.replace("Your name is Clara.", `Your name is ${personaName}.`);
    }

    private getModelName(): string {
        return (
            this.configService.get<string>("GEMINI_MODEL")?.trim() ||
            AI_MODEL_NAME
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
