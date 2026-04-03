import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { sanitizePlainText } from '../common/sanitize.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
}