import { Injectable, OnModuleInit } from '@nestjs/common';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class TelegramService implements OnModuleInit {
  private clients: Map<string, TelegramClient> = new Map();
  private prisma = new PrismaClient();

  async onModuleInit() {
    const bots = await this.prisma.botAccount.findMany({
      where: { isUserAccount: true, isActive: true },
    });

    for (const bot of bots) {
      try {
        await this.initClient(bot);
        console.log(`Initialized user client for: ${bot.name}`);
      } catch (error) {
        console.error(`Failed to init client ${bot.name}:`, error);
      }
    }
  }

  private async initClient(bot: any) {
    const stringSession = new StringSession(bot.session || '');
    const client = new TelegramClient(stringSession, bot.apiId!, bot.apiHash!, {
      connectionRetries: 5,
    });
    await client.connect();
    this.clients.set(bot.id, client);

    client.addEventHandler(async (event: any) => {
        const message = event.message;
        if (message && !message.isOut) {
            const text = message.message?.toLowerCase();
            if (text === '/start' || text === 'oi') {
                await client.sendMessage(message.chatId.toString(), { message: 'Olá! Sou o serviço separado em NestJS.' });
            }
        }
    });
  }

  async sendTemplate(botId: string, chatId: string, template: any) {
    let client = this.clients.get(botId);
    if (!client) {
        const bot = await this.prisma.botAccount.findUnique({ where: { id: botId } });
        if (!bot) throw new Error('Bot not found');
        await this.initClient(bot);
        client = this.clients.get(botId);
    }

    if (template.type === 'COMBO' && template.mediaItems) {
        if (template.text) await client.sendMessage(chatId, { message: template.text });
        const sortedMedia = [...template.mediaItems].sort((a, b) => a.order - b.order);
        for (const item of sortedMedia) {
            await client.sendFile(chatId, { file: item.url });
            await new Promise(r => setTimeout(r, 1000));
        }
        return;
    }

    if (template.type === 'TEXT') {
        await client.sendMessage(chatId, { message: template.text || '' });
    } else {
        await client.sendFile(chatId, { file: template.mediaUrl || '', caption: template.text || undefined });
    }
  }
}
