import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DeliveryStatus, Direction, MessageType, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import TelegramBot, { Message, PhotoSize } from 'node-telegram-bot-api';
import { sanitizeOptionalPlainText } from '../common/sanitize.util';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';

export type TelegramSendResult =
  | {
      success: true;
      telegramMessageId: number;
      rawPayload: Prisma.InputJsonValue;
    }
  | {
      success: false;
      errorText: string;
      isRateLimit: boolean;
      retryAfterSeconds: number | null;
    };

export type TelegramSendMediaGroupResult =
  | {
      success: true;
      telegramMessages: Array<{
        telegramMessageId: number;
        rawPayload: Prisma.InputJsonValue;
      }>;
      rawPayload: Prisma.InputJsonValue;
    }
  | {
      success: false;
      errorText: string;
      isRateLimit: boolean;
      retryAfterSeconds: number | null;
    };

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: TelegramBot | null = null;
  private botToken: string | null = null;
  private botDisplayName: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logsService: LogsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = this.configService.get<string>('BOT_TOKEN');

    if (!token) {
      throw new Error('BOT_TOKEN is required');
    }

    this.botToken = token;
    this.bot = new TelegramBot(token, {
      polling: {
        autoStart: false,
        params: {
          timeout: 30,
        },
      },
    });

    this.bot.on('message', (message: Message) => {
      void this.handleIncomingMessage(message);
    });

    this.bot.on('polling_error', (error: Error) => {
      void this.logsService.error('telegram', 'Polling error', {
        message: error.message,
      } as Prisma.InputJsonValue);
    });

    await this.refreshBotProfile();
    await this.bot.startPolling();
    await this.logsService.info('telegram', 'Long polling started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling();
    }
  }

  async sendText(telegramId: string, text: string): Promise<TelegramSendResult> {
    if (!this.bot) {
      return {
        success: false,
        errorText: 'Telegram bot is not initialized',
        isRateLimit: false,
        retryAfterSeconds: null,
      };
    }

    try {
      const sentMessage = await this.bot.sendMessage(telegramId, text);

      return {
        success: true,
        telegramMessageId: sentMessage.message_id,
        rawPayload: this.toJson(sentMessage),
      };
    } catch (error) {
      const parsed = this.extractTelegramError(error);

      return {
        success: false,
        errorText: parsed.errorText,
        isRateLimit: parsed.isRateLimit,
        retryAfterSeconds: parsed.retryAfterSeconds,
      };
    }
  }

  async sendPhoto(
    telegramId: string,
    filePath: string,
    caption?: string | null,
  ): Promise<TelegramSendResult> {
    if (!this.bot) {
      return {
        success: false,
        errorText: 'Telegram bot is not initialized',
        isRateLimit: false,
        retryAfterSeconds: null,
      };
    }

    try {
      const sentMessage = await this.bot.sendPhoto(telegramId, createReadStream(filePath), {
        caption: caption ?? undefined,
      });

      return {
        success: true,
        telegramMessageId: sentMessage.message_id,
        rawPayload: this.toJson(sentMessage),
      };
    } catch (error) {
      const parsed = this.extractTelegramError(error);

      return {
        success: false,
        errorText: parsed.errorText,
        isRateLimit: parsed.isRateLimit,
        retryAfterSeconds: parsed.retryAfterSeconds,
      };
    }
  }

  async sendMediaGroup(
    telegramId: string,
    filePaths: string[],
    caption?: string | null,
  ): Promise<TelegramSendMediaGroupResult> {
    if (!this.bot) {
      return {
        success: false,
        errorText: 'Telegram bot is not initialized',
        isRateLimit: false,
        retryAfterSeconds: null,
      };
    }

    if (filePaths.length < 2) {
      return {
        success: false,
        errorText: 'Media group requires at least 2 files',
        isRateLimit: false,
        retryAfterSeconds: null,
      };
    }

    try {
      const normalizedCaption = sanitizeOptionalPlainText(caption ?? null);
      const media = filePaths.map((filePath, index) => ({
        type: 'photo' as const,
        media: createReadStream(filePath) as unknown as string,
        caption: index === 0 && normalizedCaption ? normalizedCaption : undefined,
      }));

      const sentMessages = await this.bot.sendMediaGroup(telegramId, media);

      return {
        success: true,
        telegramMessages: sentMessages.map((message) => ({
          telegramMessageId: message.message_id,
          rawPayload: this.toJson(message),
        })),
        rawPayload: this.toJson(sentMessages),
      };
    } catch (error) {
      const parsed = this.extractTelegramError(error);

      return {
        success: false,
        errorText: parsed.errorText,
        isRateLimit: parsed.isRateLimit,
        retryAfterSeconds: parsed.retryAfterSeconds,
      };
    }
  }

  async downloadFileById(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
    if (!this.bot || !this.botToken) {
      throw new Error('Telegram bot is not initialized');
    }

    const file = await this.bot.getFile(fileId);
    if (!file.file_path) {
      throw new Error('Telegram file path is missing');
    }

    const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Telegram file download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      filePath: file.file_path,
    };
  }

  async getBotDisplayName(): Promise<string | null> {
    if (this.botDisplayName) {
      return this.botDisplayName;
    }

    await this.refreshBotProfile();
    return this.botDisplayName;
  }

  async resolveUserByUsername(username: string): Promise<{
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    languageCode: string | null;
  } | null> {
    if (!this.bot) {
      return null;
    }

    const normalizedUsername = username.replace(/^@+/, '');
    if (!normalizedUsername) {
      return null;
    }

    try {
      const chat = await this.bot.getChat(`@${normalizedUsername}`);
      const chatData = chat as TelegramBot.Chat & {
        first_name?: string;
        last_name?: string;
        username?: string;
        language_code?: string;
      };

      return {
        telegramId: String(chat.id),
        username: sanitizeOptionalPlainText(chatData.username ?? normalizedUsername),
        firstName: sanitizeOptionalPlainText(chatData.first_name),
        lastName: sanitizeOptionalPlainText(chatData.last_name),
        languageCode: sanitizeOptionalPlainText(chatData.language_code),
      };
    } catch (error) {
      await this.logsService.warn(
        'telegram',
        'Failed to resolve Telegram username',
        {
          username: normalizedUsername,
          error: String(error),
        } as Prisma.InputJsonValue,
      );
      return null;
    }
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    if (!message.from || message.from.is_bot) {
      return;
    }

    try {
      const telegramId = String(message.from.id);

      const user = await this.prisma.user.upsert({
        where: { telegramId },
        update: {
          username: sanitizeOptionalPlainText(message.from.username),
          firstName: sanitizeOptionalPlainText(message.from.first_name),
          lastName: sanitizeOptionalPlainText(message.from.last_name),
          languageCode: sanitizeOptionalPlainText(message.from.language_code),
          lastSeenAt: new Date(),
        },
        create: {
          telegramId,
          username: sanitizeOptionalPlainText(message.from.username),
          firstName: sanitizeOptionalPlainText(message.from.first_name),
          lastName: sanitizeOptionalPlainText(message.from.last_name),
          languageCode: sanitizeOptionalPlainText(message.from.language_code),
          lastSeenAt: new Date(),
        },
      });

      const messageType = this.detectMessageType(message);
      const text = sanitizeOptionalPlainText(message.text ?? null);
      const caption = sanitizeOptionalPlainText(message.caption ?? null);
      const photo = this.pickLargestPhoto(message.photo);

      await this.prisma.message.create({
        data: {
          userId: user.id,
          telegramMessageId: message.message_id,
          direction: Direction.INCOMING,
          messageType,
          text,
          caption,
          telegramFileId: photo?.file_id ?? null,
          telegramFileUniqueId: photo?.file_unique_id ?? null,
          rawPayload: this.toJson(message),
          deliveryStatus: DeliveryStatus.SENT,
          isRead: false,
        },
      });
    } catch (error) {
      await this.logsService.error(
        'telegram',
        'Failed to process incoming message',
        { error: String(error) } as Prisma.InputJsonValue,
      );
    }
  }

  private async refreshBotProfile(): Promise<void> {
    if (!this.bot) {
      this.botDisplayName = null;
      return;
    }

    try {
      const me = await this.bot.getMe();
      const firstName = sanitizeOptionalPlainText(me.first_name);
      const username = sanitizeOptionalPlainText(me.username);

      this.botDisplayName = firstName ?? (username ? username.replace(/^@+/, '') : null);
    } catch (error) {
      this.botDisplayName = null;
      await this.logsService.warn(
        'telegram',
        'Failed to load bot profile',
        { error: String(error) } as Prisma.InputJsonValue,
      );
    }
  }

  private detectMessageType(message: Message): MessageType {
    if (message.text) return MessageType.TEXT;
    if (message.photo) return MessageType.PHOTO;
    if (message.video) return MessageType.VIDEO;
    if (message.document) return MessageType.DOCUMENT;
    if (message.sticker) return MessageType.STICKER;
    if (message.audio) return MessageType.AUDIO;
    if (message.voice) return MessageType.VOICE;
    if (message.contact) return MessageType.CONTACT;
    if (message.location) return MessageType.LOCATION;
    return MessageType.OTHER;
  }

  private pickLargestPhoto(photoSizes?: PhotoSize[]): PhotoSize | null {
    if (!photoSizes || photoSizes.length === 0) {
      return null;
    }

    return photoSizes.reduce((largest, current) => {
      const largestArea = (largest.width ?? 0) * (largest.height ?? 0);
      const currentArea = (current.width ?? 0) * (current.height ?? 0);
      return currentArea >= largestArea ? current : largest;
    });
  }

  private extractTelegramError(error: unknown): {
    errorText: string;
    retryAfterSeconds: number | null;
    isRateLimit: boolean;
  } {
    if (typeof error === 'string') {
      return {
        errorText: error,
        retryAfterSeconds: null,
        isRateLimit: false,
      };
    }

    if (error && typeof error === 'object') {
      const objectError = error as {
        message?: string;
        response?: {
          statusCode?: number;
          body?: {
            description?: string;
            parameters?: { retry_after?: number };
          };
        };
      };

      const errorText =
        objectError.response?.body?.description ??
        objectError.message ??
        'Unknown Telegram error';

      const retryAfterValue = objectError.response?.body?.parameters?.retry_after;
      const retryAfterSeconds =
        typeof retryAfterValue === 'number' && Number.isFinite(retryAfterValue)
          ? Math.max(0, Math.floor(retryAfterValue))
          : null;

      const isRateLimit =
        objectError.response?.statusCode === 429 ||
        errorText.toLowerCase().includes('too many requests');

      return {
        errorText,
        retryAfterSeconds,
        isRateLimit,
      };
    }

    return {
      errorText: 'Unknown Telegram error',
      retryAfterSeconds: null,
      isRateLimit: false,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
