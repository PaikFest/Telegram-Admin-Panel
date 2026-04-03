import { Injectable } from '@nestjs/common';
import { LogLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    level: LogLevel,
    scope: string,
    message: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.systemLog.create({
      data: {
        level,
        scope,
        message,
        metadata,
      },
    });
  }

  async info(scope: string, message: string, metadata?: Prisma.InputJsonValue): Promise<void> {
    await this.log(LogLevel.INFO, scope, message, metadata);
  }

  async warn(scope: string, message: string, metadata?: Prisma.InputJsonValue): Promise<void> {
    await this.log(LogLevel.WARN, scope, message, metadata);
  }

  async error(scope: string, message: string, metadata?: Prisma.InputJsonValue): Promise<void> {
    await this.log(LogLevel.ERROR, scope, message, metadata);
  }

  async list(limit = 200): Promise<
    Array<{
      id: number;
      level: LogLevel;
      scope: string;
      message: string;
      metadata: Prisma.JsonValue | null;
      createdAt: Date;
    }>
  > {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    return this.prisma.systemLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });
  }
}