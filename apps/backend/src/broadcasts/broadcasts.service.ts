import { Injectable } from '@nestjs/common';
import { Broadcast, BroadcastStatus, Prisma } from '@prisma/client';
import { sanitizeOptionalPlainText, sanitizePlainText } from '../common/sanitize.util';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
  ) {}

  async createBroadcast(dto: CreateBroadcastDto): Promise<Broadcast> {
    const text = sanitizePlainText(dto.text);
    const title = sanitizeOptionalPlainText(dto.title);

    const broadcast = await this.prisma.$transaction(async (tx) => {
      const totalTargets = await tx.user.count({
        where: { isBlocked: false },
      });

      const created = await tx.broadcast.create({
        data: {
          title,
          text,
          status: BroadcastStatus.PENDING,
          totalTargets,
        },
      });

      if (totalTargets > 0) {
        await tx.$executeRaw`
          WITH inserted_outbox AS (
            INSERT INTO "outbox" ("user_id", "source_type", "message_type", "text", "status", "attempts", "created_at")
            SELECT "id", 'BROADCAST'::"OutboxSourceType", 'TEXT'::"MessageType", ${text}, 'PENDING'::"OutboxStatus", 0, NOW()
            FROM "users"
            WHERE "is_blocked" = false
            RETURNING "id", "user_id"
          )
          INSERT INTO "broadcast_deliveries" ("broadcast_id", "user_id", "outbox_id", "status", "created_at")
          SELECT ${created.id}, io."user_id", io."id", 'PENDING'::"BroadcastDeliveryStatus", NOW()
          FROM inserted_outbox io;
        `;
      }

      return created;
    });

    await this.logsService.info(
      'broadcast',
      `Broadcast queued id=${broadcast.id}`,
      {
        totalTargets: broadcast.totalTargets,
      } as Prisma.InputJsonValue,
    );

    return broadcast;
  }

  async listBroadcasts() {
    return this.prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listDeliveries(broadcastId: number) {
    return this.prisma.broadcastDelivery.findMany({
      where: { broadcastId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        outbox: {
          select: {
            id: true,
            status: true,
            attempts: true,
            errorText: true,
            sentAt: true,
          },
        },
      },
    });
  }
}
