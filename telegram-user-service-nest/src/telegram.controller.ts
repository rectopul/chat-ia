import { Controller, Post, Body, ForbiddenException } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('send')
  async send(@Body() body: any) {
    const { botId, chatId, template, secret } = body;

    if (secret !== process.env.TELEGRAM_SERVICE_SECRET) {
      throw new ForbiddenException('Invalid secret');
    }

    await this.telegramService.sendTemplate(botId, chatId, template);
    return { ok: true };
  }
}
