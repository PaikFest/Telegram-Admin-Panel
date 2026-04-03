import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Direction, MessageType, OutboxSourceType, Prisma } from '@prisma/client';
import { sanitizeOptionalPlainText, sanitizePlainText } from '../common/sanitize.util';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_TELEGRAM_CAPTION_LENGTH = 1024;

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
  ) {}

  async listConversations(search?: string): Promise<
    Array<{
      user: {
        id: number;
        telegramId: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        isBlocked: boolean;
        lastSeenAt: Date | null;
      };
      unreadCount: number;
      lastMessage: {
        id: number;
        text: string | null;
        direction: Direction;
        createdAt: Date;
      } | null;
    }>
  > {
    const users = await this.prisma.user.findMany({
      where: {
        ...this.buildSearchWhere(search),
        messages: { some: {} },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        isBlocked: true,
        lastSeenAt: true,
      },
    });

    const items = await Promise.all(
      users.map(async (user) => {
        const [unreadCount, lastMessage] = await Promise.all([
          this.prisma.message.count({
            where: {
              userId: user.id,
              direction: Direction.INCOMING,
              isRead: false,
            },
          }),
          this.prisma.message.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              text: true,
              direction: true,
              createdAt: true,
            },
          }),
        ]);

        return { user, unreadCount, lastMessage };
      }),
    );

    return items.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt?.getTime() ?? 0;
      const bTime = b.lastMessage?.createdAt?.getTime() ?? 0;
      return bTime - aTime;
    });
  }

  async getConversationMessages(userId: number, limit = 150) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const safeLimit = Math.max(1, Math.min(limit, 500));

    const recentMessages = await this.prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    await this.prisma.message.updateMany({
      where: {
        userId,
        direction: Direction.INCOMING,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return recentMessages.reverse();
  }

  async sendReply(userId: number, text: string): Promise<{ success: boolean; outboxId: number }> {
    const sanitizedText = sanitizePlainText(text);

    if (sanitizedText.length === 0) {
      throw new BadRequestException('Message text is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const job = await this.prisma.outbox.create({
      data: {
        userId,
        sourceType: OutboxSourceType.REPLY,
        messageType: MessageType.TEXT,
        text: sanitizedText,
      },
      select: {
        id: true,
      },
    });

    await this.logsService.info(
      'outbox',
      `Reply queued for userId=${userId}`,
      {
        outboxId: job.id,
      } as Prisma.InputJsonValue,
    );

    return { success: true, outboxId: job.id };
  }

  async sendReplyMedia(
    userId: number,
    file: {
      path: string;
      mimetype: string;
      originalname: string;
    } | null,
    caption?: string,
  ): Promise<{ success: boolean; outboxId: number }> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const normalizedCaption = sanitizeOptionalPlainText(caption);
    if (
      normalizedCaption !== null &&
      normalizedCaption.length > MAX_TELEGRAM_CAPTION_LENGTH
    ) {
      throw new BadRequestException(
        `Caption is too long (max ${MAX_TELEGRAM_CAPTION_LENGTH} characters)`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const job = await this.prisma.outbox.create({
      data: {
        userId,
        sourceType: OutboxSourceType.REPLY,
        messageType: MessageType.PHOTO,
        text: null,
        caption: normalizedCaption,
        filePath: file.path,
        mimeType: sanitizeOptionalPlainText(file.mimetype),
        originalFileName: sanitizeOptionalPlainText(file.originalname),
      },
      select: {
        id: true,
      },
    });

    await this.logsService.info(
      'outbox',
      `Photo reply queued for userId=${userId}`,
      {
        outboxId: job.id,
      } as Prisma.InputJsonValue,
    );

    return { success: true, outboxId: job.id };
  }

  private buildSearchWhere(search?: string): Prisma.UserWhereInput {
    if (!search || search.trim() === '') {
      return {};
    }

    const term = sanitizePlainText(search);
    return {
      OR: [
        { username: { contains: term, mode: 'insensitive' } },
        { telegramId: { contains: term } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ],
    };
  }
}
