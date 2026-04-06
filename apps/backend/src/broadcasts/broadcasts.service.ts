import { BadRequestException, Injectable } from '@nestjs/common';
import { Broadcast, BroadcastStatus, Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { sanitizeOptionalPlainText, sanitizePlainText } from '../common/sanitize.util';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBroadcastMediaDto } from './dto/create-broadcast-media.dto';
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
          status: totalTargets === 0 ? BroadcastStatus.FINISHED : BroadcastStatus.PENDING,
          totalTargets,
          finishedAt: totalTargets === 0 ? new Date() : null,
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

    try {
      await this.logsService.info(
        'broadcast',
        `Broadcast queued id=${broadcast.id}`,
        {
          totalTargets: broadcast.totalTargets,
        } as Prisma.InputJsonValue,
      );
    } catch {
      // Do not fail successful queueing because logging failed.
    }

    return broadcast;
  }

  async createBroadcastWithMedia(
    dto: CreateBroadcastMediaDto,
    files: Array<{
      path: string;
      mimetype: string;
      originalname: string;
    }>,
  ): Promise<Broadcast> {
    const text = sanitizeOptionalPlainText(dto.text);
    const title = sanitizeOptionalPlainText(dto.title);

    if (!text && files.length === 0) {
      throw new BadRequestException('Provide broadcast text and/or at least one image');
    }

    let result: {
      created: Broadcast;
      hasQueuedJobs: boolean;
    };

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const activeUsers = await tx.user.count({
          where: { isBlocked: false },
        });

        const jobsPerUser = files.length > 0 ? files.length : (text ? 1 : 0);
        const useMediaGroup = files.length > 1;
        const totalTargets = activeUsers * jobsPerUser;

        const created = await tx.broadcast.create({
          data: {
            title,
            text: text ?? '',
            status: totalTargets === 0 ? BroadcastStatus.FINISHED : BroadcastStatus.PENDING,
            totalTargets,
            finishedAt: totalTargets === 0 ? new Date() : null,
          },
        });

        if (activeUsers > 0 && jobsPerUser > 0) {
          if (text && files.length === 0) {
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

          for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
            const file = files[fileIndex];
            await tx.$executeRaw`
              WITH inserted_outbox AS (
                INSERT INTO "outbox" (
                  "user_id",
                  "source_type",
                  "message_type",
                  "text",
                  "caption",
                  "file_path",
                  "mime_type",
                  "original_file_name",
                  "media_group_id",
                  "media_group_order",
                  "status",
                  "attempts",
                  "created_at"
                )
                SELECT
                  "id",
                  'BROADCAST'::"OutboxSourceType",
                  'PHOTO'::"MessageType",
                  NULL,
                  ${fileIndex === 0 ? text : null},
                  ${file.path},
                  ${sanitizeOptionalPlainText(file.mimetype)},
                  ${sanitizeOptionalPlainText(file.originalname)},
                  ${
                    useMediaGroup
                      ? Prisma.sql`('broadcast-' || ${created.id} || '-user-' || "id")`
                      : Prisma.sql`NULL`
                  },
                  ${useMediaGroup ? Prisma.sql`${fileIndex}` : Prisma.sql`NULL`},
                  'PENDING'::"OutboxStatus",
                  0,
                  NOW()
                FROM "users"
                WHERE "is_blocked" = false
                RETURNING "id", "user_id"
              )
              INSERT INTO "broadcast_deliveries" ("broadcast_id", "user_id", "outbox_id", "status", "created_at")
              SELECT ${created.id}, io."user_id", io."id", 'PENDING'::"BroadcastDeliveryStatus", NOW()
              FROM inserted_outbox io;
            `;
          }
        }

        return {
          created,
          hasQueuedJobs: activeUsers > 0 && jobsPerUser > 0,
        };
      });

    } catch (error) {
      await this.cleanupStagedFiles(files);
      throw error;
    }

    const broadcast = result.created;

    if (!result.hasQueuedJobs && files.length > 0) {
      await this.cleanupStagedFiles(files);
    }

    try {
      await this.logsService.info(
        'broadcast',
        `Broadcast with media queued id=${broadcast.id}`,
        {
          totalTargets: broadcast.totalTargets,
          hasText: Boolean(text),
          mediaCount: files.length,
        } as Prisma.InputJsonValue,
      );
    } catch {
      try {
        await this.logsService.warn(
          'broadcast',
          `Broadcast queued id=${broadcast.id} but failed to write info log`,
        );
      } catch {
        // Do not fail successful queueing because logging failed.
      }
    }

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

  private async cleanupStagedFiles(
    files: Array<{
      path: string;
    }>,
  ): Promise<void> {
    for (const file of files) {
      try {
        if (!file.path || !existsSync(file.path)) {
          continue;
        }
        await unlink(file.path);
      } catch (error) {
        try {
          await this.logsService.warn(
            'broadcast',
            'Failed to cleanup staged broadcast image after queueing error',
            {
              filePath: file.path,
              error: String(error),
            } as Prisma.InputJsonValue,
          );
        } catch {
          // Best-effort cleanup logging.
        }
      }
    }
  }
}
