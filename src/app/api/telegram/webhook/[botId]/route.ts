import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TelegramService } from "@/lib/telegram";
import { scheduleCampaignsForUser } from "@/lib/scheduler";
import { SyncPayService } from "@/lib/syncpay";
import {
    MessageTemplateKey,
    MediaType,
    MessageDirection,
    UserSegment,
    SaleStatus,
} from "@prisma/client";
import axios from "axios";

async function handleCallbackQuery(callbackQuery: any, botId: string, botToken: string) {
    const chatId = callbackQuery.message.chat.id.toString();
    const telegramUserId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    if (data === "list_products") {
        const products = await prisma.product.findMany({
            where: { isActive: true },
        });
        if (products.length === 0) {
<<<<<<< HEAD:src/app/api/telegram/webhook/[botId]/route.ts
            await TelegramService.sendText(chatId, "No momento não temos produtos disponíveis.", telegramUserId, botId, botToken);
        } else {
            for (const product of products) {
                const text = `<b>${product.title}</b>\n${product.description || ""}\n\nPreço: R$ ${product.priceCents / 100}`;
                await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    chat_id: chatId,
                    text,
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [[{ text: "🛒 Comprar", callback_data: `buy_${product.id}` }]]
                    }
                });
            }
        }
    } else if (data === "subscriber_content") {
        const user = await prisma.telegramUser.findFirst({ where: { telegramUserId, botId } });
        if (user?.isSubscriber) {
            const template = await prisma.messageTemplate.findFirst({ where: { key: MessageTemplateKey.SUBSCRIBER_CONTENT, isActive: true } });
            if (template) await TelegramService.sendMessageTemplate(chatId, telegramUserId, template, botId, botToken);
            else await TelegramService.sendText(chatId, "Aqui está seu conteúdo exclusivo!", telegramUserId, botId, botToken);
        } else {
            const template = await prisma.messageTemplate.findFirst({ where: { key: MessageTemplateKey.DONT_SELL, isActive: true } });
            if (template) await TelegramService.sendMessageTemplate(chatId, telegramUserId, template, botId, botToken);
            else await TelegramService.sendText(chatId, "Você ainda não é um assinante.", telegramUserId, botId, botToken);
        }
    } else if (data === "support") {
        await TelegramService.sendText(chatId, "Para suporte, entre em contato com @admin_username", telegramUserId, botId, botToken);
=======
            await TelegramService.sendText(
                chatId,
                "No momento não temos produtos disponíveis.",
                telegramUserId,
            );
        } else {
            for (const product of products) {
                const text = `<b>${product.title}</b>\n${product.description || ""}\n\nPreço: R$ ${product.priceCents / 100}`;
                await axios.post(
                    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
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
        const user = await prisma.telegramUser.findUnique({
            where: { telegramUserId },
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
                );
            else
                await TelegramService.sendText(
                    chatId,
                    "Aqui está seu conteúdo exclusivo!",
                    telegramUserId,
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
                );
            else
                await TelegramService.sendText(
                    chatId,
                    "Você ainda não é um assinante.",
                    telegramUserId,
                );
        }
    } else if (data === "support") {
        await TelegramService.sendText(
            chatId,
            "Para suporte, entre em contato com @admin_username",
            telegramUserId,
        );
>>>>>>> f0a2b04 (ajustes):src/app/api/telegram/webhook/route.ts
    } else if (data.startsWith("buy_")) {
        const productId = data.split("_")[1];
        const product = await prisma.product.findUnique({
            where: { id: productId },
        });
        if (product) {
            const referenceId = `sale_${Date.now()}_${telegramUserId}`;
            await prisma.sale.create({
                data: {
                    botId,
                    telegramUserId,
                    productId: product.id,
                    amountCents: product.priceCents,
                    referenceId,
                    status: SaleStatus.PENDING,
                },
            });

            const charge = await SyncPayService.createCharge({
                amountCents: product.priceCents,
                referenceId,
                productTitle: product.title,
            });

<<<<<<< HEAD:src/app/api/telegram/webhook/[botId]/route.ts
            await TelegramService.sendText(chatId, `Para concluir sua compra de <b>${product.title}</b>, utilize o Pix Copia e Cola abaixo:`, telegramUserId, botId, botToken);
            await TelegramService.sendText(chatId, `<code>${charge.pix_code}</code>`, telegramUserId, botId, botToken);
            await TelegramService.sendText(chatId, `Após o pagamento, seu acesso será liberado automaticamente.`, telegramUserId, botId, botToken);
=======
            await TelegramService.sendText(
                chatId,
                `Para concluir sua compra de <b>${product.title}</b>, utilize o Pix Copia e Cola abaixo:`,
                telegramUserId,
            );
            await TelegramService.sendText(
                chatId,
                `<code>${charge.pix_code}</code>`,
                telegramUserId,
            );
            await TelegramService.sendText(
                chatId,
                `Após o pagamento, seu acesso será liberado automaticamente.`,
                telegramUserId,
            );
>>>>>>> f0a2b04 (ajustes):src/app/api/telegram/webhook/route.ts
        }
    }

    return NextResponse.json({ ok: true });
}

<<<<<<< HEAD:src/app/api/telegram/webhook/[botId]/route.ts
export async function POST(req: NextRequest, { params }: { params: Promise<{ botId: string }> }) {
  const botId = (await params).botId;
  const bot = await prisma.botAccount.findUnique({ where: { id: botId } });

  if (!bot) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== bot.webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
=======
export async function POST(req: NextRequest) {
    const secret = req.headers.get("x-telegram-bot-api-secret-token");

    console.log(
        "secret recebido: ",
        secret,
        "token esperado: ",
        process.env.TELEGRAM_WEBHOOK_SECRET,
    );
>>>>>>> f0a2b04 (ajustes):src/app/api/telegram/webhook/route.ts

    // X-Telegram-Bot-Api-Secret-Token

<<<<<<< HEAD:src/app/api/telegram/webhook/[botId]/route.ts
    if (payload.callback_query) {
      return handleCallbackQuery(payload.callback_query, botId, bot.token);
=======
    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
>>>>>>> f0a2b04 (ajustes):src/app/api/telegram/webhook/route.ts
    }

    try {
        const payload = await req.json();

        if (payload.callback_query) {
            return handleCallbackQuery(payload.callback_query);
        }

<<<<<<< HEAD:src/app/api/telegram/webhook/[botId]/route.ts
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
          [{ text: "🛍️ Ver Produtos", callback_data: "list_products" }],
          [{ text: "💎 Conteúdo Assinante", callback_data: "subscriber_content" }],
          [{ text: "💬 Suporte", callback_data: "support" }],
        ],
      };

      await axios.post(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
          chat_id: chatId,
          text: welcomeTemplate?.text || "Olá! Bem-vindo ao nosso bot. Escolha uma opção abaixo:",
          reply_markup: menuMarkup,
          parse_mode: "HTML"
      });

      if (isFirstContact) {
        await scheduleCampaignsForUser(
          botId,
          telegramUserId,
          chatId,
          UserSegment.NEW_USERS
        );
      }
    } else if (text.toLowerCase().includes("conteudo") || text.toLowerCase().includes("assinante")) {
        // ... (similar logic as callback query)
    }
=======
        if (!payload.message) {
            return NextResponse.json({ ok: true });
        }

        const { message } = payload;
        const chatId = String(message.chat.id);
        const telegramUserId = message.from.id.toString();
        const username = message.from.username;
        const firstName = message.from.first_name;
        const lastName = message.from.last_name;
        const text = message.text || "";

        // Upsert User
        const user = await prisma.telegramUser.upsert({
            where: { telegramUserId },
            update: {
                lastSeenAt: new Date(),
                username,
                firstName,
                lastName,
                chatId,
            },
            create: {
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
                telegramUserId,
                direction: MessageDirection.IN,
                type: MediaType.TEXT,
                text,
            },
        });

        // check if user already exist
        const userSchedulerExists = await prisma.scheduledMessageJob.findFirst({
            where: { chatId },
        });

        if (!userSchedulerExists) {
            console.log("Nao esta nos jobs: ", chatId);
            await scheduleCampaignsForUser(
                telegramUserId,
                chatId,
                UserSegment.NEW_USERS,
            );
        }

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

            if (welcomeTemplate) {
                await axios.post(
                    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        chat_id: chatId,
                        text: welcomeTemplate.text || "Bem-vindo!",
                        reply_markup: menuMarkup,
                        parse_mode: "HTML",
                    },
                );
            } else {
                await axios.post(
                    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
                    {
                        chat_id: chatId,
                        text: "Olá! Bem-vindo ao nosso bot. Escolha uma opção abaixo:",
                        reply_markup: menuMarkup,
                        parse_mode: "HTML",
                    },
                );
            }
        } else if (
            text.toLowerCase().includes("conteudo") ||
            text.toLowerCase().includes("assinante")
        ) {
            if (user.isSubscriber) {
                const subscriberTemplate =
                    await prisma.messageTemplate.findFirst({
                        where: {
                            key: MessageTemplateKey.SUBSCRIBER_CONTENT,
                            isActive: true,
                        },
                    });
                if (subscriberTemplate) {
                    await TelegramService.sendMessageTemplate(
                        chatId,
                        telegramUserId,
                        subscriberTemplate,
                    );
                } else {
                    await TelegramService.sendText(
                        chatId,
                        "Aqui está seu conteúdo exclusivo!",
                        telegramUserId,
                    );
                }
            } else {
                const dontSellTemplate = await prisma.messageTemplate.findFirst(
                    {
                        where: {
                            key: MessageTemplateKey.DONT_SELL,
                            isActive: true,
                        },
                    },
                );
                if (dontSellTemplate) {
                    await TelegramService.sendMessageTemplate(
                        chatId,
                        telegramUserId,
                        dontSellTemplate,
                    );
                } else {
                    await TelegramService.sendText(
                        chatId,
                        "Você ainda não é um assinante. Adquira um produto para ter acesso.",
                        telegramUserId,
                    );
                }
            }
        }
>>>>>>> f0a2b04 (ajustes):src/app/api/telegram/webhook/route.ts

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("Error processing Telegram webhook:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
        );
    }
}
