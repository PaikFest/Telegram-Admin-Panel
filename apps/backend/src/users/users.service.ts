import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { sanitizeOptionalPlainText, sanitizePlainText } from '../common/sanitize.util';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  async listUsers(search?: string): Promise<User[]> {
    const where = this.buildSearchWhere(search);

    return this.prisma.user.findMany({
      where,
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async getUserById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createManualUser(dto: CreateUserDto): Promise<User> {
    const normalizedTelegramId = this.normalizeTelegramId(dto.telegramId);
    const normalizedUsername = this.normalizeUsername(dto.username);

    if (!normalizedTelegramId && !normalizedUsername) {
      throw new BadRequestException('Provide Telegram ID or username');
    }

    let telegramId = normalizedTelegramId;
    let username = normalizedUsername;
    let firstName: string | null = null;
    let lastName: string | null = null;
    let languageCode: string | null = null;

    if (!telegramId && normalizedUsername) {
      const resolved = await this.telegramService.resolveUserByUsername(normalizedUsername);
      if (!resolved) {
        throw new BadRequestException(
          'Could not resolve Telegram ID from username. Provide Telegram ID manually.',
        );
      }

      telegramId = resolved.telegramId;
      username = resolved.username ?? normalizedUsername;
      firstName = resolved.firstName;
      lastName = resolved.lastName;
      languageCode = resolved.languageCode;
    }

    if (!telegramId) {
      throw new BadRequestException('Telegram ID is required');
    }

    return this.prisma.user.upsert({
      where: { telegramId },
      update: {
        username,
        firstName,
        lastName,
        languageCode,
      },
      create: {
        telegramId,
        username,
        firstName,
        lastName,
        languageCode,
      },
    });
  }

  private buildSearchWhere(search?: string): Prisma.UserWhereInput {
    if (!search || search.trim() === '') {
      return {};
    }

    const term = sanitizePlainText(search);
    const parsedTelegramId = term.replace(/\D/g, '');

    const orConditions: Prisma.UserWhereInput[] = [
      { username: { contains: term, mode: 'insensitive' } },
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { telegramId: { contains: term } },
    ];

    if (parsedTelegramId.length > 0) {
      orConditions.push({ telegramId: parsedTelegramId });
    }

    return { OR: orConditions };
  }

  private normalizeTelegramId(value?: string): string | null {
    if (!value) return null;
    const cleaned = value.replace(/\s+/g, '').replace(/[^\d]/g, '');
    return cleaned.length > 0 ? cleaned : null;
  }

  private normalizeUsername(value?: string): string | null {
    const sanitized = sanitizeOptionalPlainText(value);
    if (!sanitized) return null;
    return sanitized.replace(/^@+/, '');
  }
}
