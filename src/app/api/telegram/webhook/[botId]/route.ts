import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TelegramService } from "@/lib/telegram";
import { scheduleCampaignsForUser } from "@/lib/scheduler";
import {
    MessageTemplateKey,
    MediaType,
    MessageDirection,
    UserSegment,
} from "@prisma/client";
import axios from "axios";
import { getNestApiBaseUrl } from "@/lib/nest-api";

async function handleCallbackQuery(
    callbackQuery: any,
    botId: string,
    botToken: string,
) {
    const chatId = callbackQuery.message.chat.id.toString();
    const telegramUserId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    if (data === "list_products") {
        const products = await prisma.product.findMany({
            where: { isActive: true },
        });
        if (products.length === 0) {
            await TelegramService.sendText(
                chatId,
                "No momento não temos produtos disponíveis.",
                telegramUserId,
                botId,
                botToken,
            );
        } else {
            for (const product of products) {
                const text = `<b>${product.title}</b>\n${product.description || ""}\n\nPreço: R$ ${product.priceCents / 100}`;
                await axios.post(
                    `https://api.telegram.org/bot${botToken}/sendMessage`,
                    {
                        chat_id: chatId,
                        text,
                        parse_mode: "HTML",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "🛒 Comprar",
                                        callback_data: `buy_${product.id}`,
                                    },
                                ],
                            ],
                        },
                    },
                );
            }
        }
    } else if (data === "subscriber_content") {
        const user = await prisma.telegramUser.findFirst({
            where: { telegramUserId, botId },
        });
        if (user?.isSubscriber) {
            const template = await prisma.messageTemplate.findFirst({
                where: {
                    key: MessageTemplateKey.SUBSCRIBER_CONTENT,
                    isActive: true,
                },
            });
            if (template)
                await TelegramService.sendMessageTemplate(
                    chatId,
                    telegramUserId,
                    template,
                    botId,
                    botToken,
                );
            else
                await TelegramService.sendText(
                    chatId,
                    "Aqui está seu conteúdo exclusivo!",
                    telegramUserId,
                    botId,
                    botToken,
                );
        } else {
            const template = await prisma.messageTemplate.findFirst({
                where: { key: MessageTemplateKey.DONT_SELL, isActive: true },
            });
            if (template)
                await TelegramService.sendMessageTemplate(
                    chatId,
                    telegramUserId,
                    template,
                    botId,
                    botToken,
                );
            else
                await TelegramService.sendText(
                    chatId,
                    "Você ainda não é um assinante.",
                    telegramUserId,
                    botId,
                    botToken,
                );
        }
    } else if (data === "support") {
        await TelegramService.sendText(
            chatId,
            "Para suporte, entre em contato com @admin_username",
            telegramUserId,
            botId,
            botToken,
        );
    } else if (data.startsWith("buy_")) {
        const productId = data.split("_")[1];
        const product = await prisma.product.findUnique({
            where: { id: productId },
        });
        if (product) {
            const { data: checkout } = await axios.post(
                `${getNestApiBaseUrl()}/telegram/create-sale-checkout`,
                {
                    botId,
                    telegramUserId,
                    productId: product.id,
                },
            );

            await TelegramService.sendText(
                chatId,
                `Para concluir sua compra de <b>${product.title}</b>, utilize o Pix Copia e Cola abaixo:`,
                telegramUserId,
                botId,
                botToken,
            );
            await TelegramService.sendText(
                chatId,
                `<code>${checkout.pixCode}</code>`,
                telegramUserId,
                botId,
                botToken,
            );
            await TelegramService.sendText(
                chatId,
                `Após o pagamento, seu acesso será liberado automaticamente.`,
                telegramUserId,
                botId,
                botToken,
            );
        }
    }

    return NextResponse.json({ ok: true });
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ botId: string }> },
) {
    const botId = (await params).botId;
    const bot = await prisma.botAccount.findUnique({ where: { id: botId } });

    if (!bot) {
        return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    const secret = req.nextUrl.searchParams.get("secret");
    if (secret !== bot.webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const payload = await req.json();

        if (payload.callback_query) {
            return handleCallbackQuery(
                payload.callback_query,
                botId,
                bot.token || "",
            );
        }

        if (!payload.message) {
            return NextResponse.json({ ok: true });
        }

        const { message } = payload;
        const chatId = message.chat.id.toString();
        const telegramUserId = message.from.id.toString();
        const username = message.from.username;
        const firstName = message.from.first_name;
        const lastName = message.from.last_name;
        const text = message.text || "";

        // Upsert User
        const user = await prisma.telegramUser.upsert({
            where: { telegramUserId_botId: { telegramUserId, botId } }, // Needs unique constraint update
            update: {
                lastSeenAt: new Date(),
                username,
                firstName,
                lastName,
                chatId,
            },
            create: {
                botId,
                telegramUserId,
                chatId,
                username,
                firstName,
                lastName,
            },
        });

        // Log IN message
        await prisma.messageLog.create({
            data: {
                botId,
                telegramUserId,
                direction: MessageDirection.IN,
                type: MediaType.TEXT,
                text,
            },
        });

        const isFirstContact =
            new Date().getTime() - user.firstSeenAt.getTime() < 5000;

        if (text === "/start" || isFirstContact) {
            // Send Welcome Message
            const welcomeTemplate = await prisma.messageTemplate.findFirst({
                where: { key: MessageTemplateKey.WELCOME, isActive: true },
            });

            const menuMarkup = {
                inline_keyboard: [
                    [
                        {
                            text: "🛍️ Ver Produtos",
                            callback_data: "list_products",
                        },
                    ],
                    [
                        {
                            text: "💎 Conteúdo Assinante",
                            callback_data: "subscriber_content",
                        },
                    ],
                    [{ text: "💬 Suporte", callback_data: "support" }],
                ],
            };

            await axios.post(
                `https://api.telegram.org/bot${bot.token || ""}/sendMessage`,
                {
                    chat_id: chatId,
                    text:
                        welcomeTemplate?.text ||
                        "Olá! Bem-vindo ao nosso bot. Escolha uma opção abaixo:",
                    reply_markup: menuMarkup,
                    parse_mode: "HTML",
                },
            );

            if (isFirstContact) {
                await scheduleCampaignsForUser(
                    botId,
                    telegramUserId,
                    chatId,
                    UserSegment.NEW_USERS,
                );
            }
        } else if (
            text.toLowerCase().includes("conteudo") ||
            text.toLowerCase().includes("assinante")
        ) {
            // ... (similar logic as callback query)
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error processing Telegram webhook:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
