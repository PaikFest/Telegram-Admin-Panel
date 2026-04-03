import { Injectable, NotFoundException } from '@nestjs/common';
import { MessageType } from '@prisma/client';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  async getMessagePhotoFile(messageId: number): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  }> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        messageType: true,
        telegramFileId: true,
      },
    });

    if (!message || message.messageType !== MessageType.PHOTO || !message.telegramFileId) {
      throw new NotFoundException('Photo not found for this message');
    }

    const downloaded = await this.telegramService.downloadFileById(message.telegramFileId);
    const extension = extname(downloaded.filePath || '').toLowerCase() || '.jpg';

    return {
      buffer: downloaded.buffer,
      mimeType: this.detectMimeType(extension),
      fileName: `message-${message.id}${extension}`,
    };
  }

  private detectMimeType(extension: string): string {
    switch (extension) {
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.jpeg':
      case '.jpg':
      default:
        return 'image/jpeg';
    }
  }
}
