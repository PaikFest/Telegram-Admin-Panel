import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  BroadcastDeliveryStatus,
  BroadcastStatus,
  DeliveryStatus,
  Direction,
  MessageType,
  OutboxStatus,
  Prisma,
} from '@prisma/client';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';

type ClaimedOutboxRow = {
  id: number;
  user_id: number;
  source_type: 'REPLY' | 'BROADCAST';
  message_type: MessageType;
  text: string | null;
  caption: string | null;
  file_path: string | null;
  mime_type: string | null;
  original_file_name: string | null;
  media_group_id: string | null;
  media_group_order: number | null;
  attempts: number;
};

type BroadcastStatsRow = {
  success_count: number;
  failed_count: number;
  pending_count: number;
  processing_count: number;
  total_count: number;
};

const WORKER_LOOP_INTERVAL_MS = 1200;
const OUTBOX_BATCH_SIZE = 25;
const OUTBOX_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_DELAY_BETWEEN_SEND_MS = 120;
const MAX_429_RETRIES_PER_CLAIM = 3;
const MAX_OUTBOX_ATTEMPTS = 10;

@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private tickInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly logsService: LogsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.timer = setInterval(() => {
      void this.tick();
    }, WORKER_LOOP_INTERVAL_MS);

    await this.tick();
    await this.logsService.info('outbox-worker', 'Outbox worker started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.tickInProgress) {
      return;
    }

    this.tickInProgress = true;
    try {
      await this.recoverStaleProcessingJobs();
      const jobs = await this.claimPendingJobs();

      if (jobs.length === 0) {
        return;
      }

      const claimedOutboxIds = jobs.map((job) => job.id);
      await this.refreshBroadcastStatsByOutboxIds(claimedOutboxIds);

      for (const job of jobs) {
        await this.processJob(job);
        await this.sleep(MIN_DELAY_BETWEEN_SEND_MS);
      }
    } catch (error) {
      await this.logsService.error(
        'outbox-worker',
        'Worker tick failed',
        { error: String(error) } as Prisma.InputJsonValue,
      );
    } finally {
      this.tickInProgress = false;
    }
  }

  private async recoverStaleProcessingJobs(): Promise<void> {
    const staleBefore = new Date(Date.now() - OUTBOX_PROCESSING_TIMEOUT_MS);

    const requeued = await this.prisma.$queryRaw<Array<{ id: number }>>`
      UPDATE "outbox"
      SET "status" = 'PENDING',
          "processing_started_at" = NULL,
          "error_text" = 'Recovered after stale processing timeout'
      WHERE "status" = 'PROCESSING'
        AND "processing_started_at" IS NOT NULL
        AND "processing_started_at" < ${staleBefore}
        AND "attempts" < ${MAX_OUTBOX_ATTEMPTS}
      RETURNING "id";
    `;

    const failed = await this.prisma.$queryRaw<
      Array<{ id: number; source_type: 'REPLY' | 'BROADCAST'; message_type: MessageType; file_path: string | null }>
    >`
      UPDATE "outbox"
      SET "status" = 'FAILED',
          "processing_started_at" = NULL,
          "error_text" = 'Failed after max attempts reached during stale recovery'
      WHERE "status" = 'PROCESSING'
        AND "processing_started_at" IS NOT NULL
        AND "processing_started_at" < ${staleBefore}
        AND "attempts" >= ${MAX_OUTBOX_ATTEMPTS}
      RETURNING "id", "source_type", "message_type", "file_path";
    `;

    if (requeued.length === 0 && failed.length === 0) {
      return;
    }

    const requeuedIds = requeued.map((item) => item.id);
    const failedIds = failed.map((item) => item.id);

    if (requeuedIds.length > 0) {
      await this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE "broadcast_deliveries"
          SET "status" = 'PENDING',
              "error_text" = NULL
          WHERE "outbox_id" IN (${Prisma.join(requeuedIds)})
            AND "status" = 'PROCESSING';
        `,
      );
    }

    if (failedIds.length > 0) {
      await this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE "broadcast_deliveries"
          SET "status" = 'FAILED',
              "error_text" = 'Failed after max attempts reached during stale recovery'
          WHERE "outbox_id" IN (${Prisma.join(failedIds)});
        `,
      );
    }

    const affectedIds = [...requeuedIds, ...failedIds];
    await this.refreshBroadcastStatsByOutboxIds(affectedIds);

    for (const job of failed) {
      await this.cleanupUploadedFile(job.id, job.source_type, job.message_type, job.file_path, 'stale-failed');
    }

    await this.logsService.warn(
      'outbox-worker',
      `Recovered stale PROCESSING jobs requeued=${requeuedIds.length}, failed=${failedIds.length}`,
    );
  }

  private async claimPendingJobs(): Promise<ClaimedOutboxRow[]> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<ClaimedOutboxRow[]>`
        WITH picked AS (
          SELECT "id"
          FROM "outbox"
          WHERE "status" = 'PENDING'
          ORDER BY "created_at" ASC, "id" ASC
          LIMIT ${OUTBOX_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "outbox" o
        SET "status" = 'PROCESSING',
            "processing_started_at" = NOW(),
            "attempts" = o."attempts" + 1,
            "error_text" = NULL
        FROM picked
        WHERE o."id" = picked."id"
        RETURNING
          o."id",
          o."user_id",
          o."source_type",
          o."message_type",
          o."text",
          o."caption",
          o."file_path",
          o."mime_type",
          o."original_file_name",
          o."media_group_id",
          o."media_group_order",
          o."attempts";
      `;

      if (claimed.length > 0) {
        const ids = claimed.map((job) => job.id);
        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "broadcast_deliveries"
            SET "status" = 'PROCESSING'
            WHERE "outbox_id" IN (${Prisma.join(ids)})
              AND "status" = 'PENDING';
          `,
        );
      }

      return claimed;
    });
  }

  private async processJob(job: ClaimedOutboxRow): Promise<void> {
    if (
      job.source_type === 'REPLY' &&
      job.message_type === MessageType.PHOTO &&
      job.media_group_id
    ) {
      await this.processInboxMediaGroupJob(job);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: job.user_id },
      select: {
        id: true,
        telegramId: true,
        isBlocked: true,
      },
    });

    if (!user) {
      await this.failJob(job, 'User not found');
      return;
    }

    if (user.isBlocked) {
      await this.failJob(job, 'User is marked as blocked');
      return;
    }

    let sendResult;
    if (job.message_type === MessageType.PHOTO) {
      if (!job.file_path || !existsSync(job.file_path)) {
        await this.failJob(job, 'Photo file is missing on disk');
        return;
      }

      sendResult = await this.telegramService.sendPhoto(
        user.telegramId,
        job.file_path,
        job.caption,
      );
    } else {
      if (!job.text || job.text.trim().length === 0) {
        await this.failJob(job, 'Text message is empty');
        return;
      }

      sendResult = await this.telegramService.sendText(user.telegramId, job.text);
    }
    let rateLimitRetries = 0;

    while (!sendResult.success && sendResult.isRateLimit && rateLimitRetries < MAX_429_RETRIES_PER_CLAIM) {
      const retryAfterSeconds = sendResult.retryAfterSeconds ?? 1;
      await this.logsService.warn(
        'outbox-worker',
        `Telegram 429 for outboxId=${job.id}, retry_after=${retryAfterSeconds}s`,
      );
      await this.sleep((retryAfterSeconds + 1) * 1000);
      rateLimitRetries += 1;
      if (job.message_type === MessageType.PHOTO) {
        if (!job.file_path || !existsSync(job.file_path)) {
          await this.failJob(job, 'Photo file is missing on disk');
          return;
        }
        sendResult = await this.telegramService.sendPhoto(
          user.telegramId,
          job.file_path,
          job.caption,
        );
      } else {
        if (!job.text || job.text.trim().length === 0) {
          await this.failJob(job, 'Text message is empty');
          return;
        }
        sendResult = await this.telegramService.sendText(user.telegramId, job.text);
      }
    }

    if (sendResult.success) {
      await this.completeJob(job, sendResult.telegramMessageId, sendResult.rawPayload);
      return;
    }

    if (sendResult.isRateLimit && job.attempts < MAX_OUTBOX_ATTEMPTS) {
      await this.requeueRateLimitedJob(job, sendResult.errorText);
      return;
    }

    await this.failJob(job, sendResult.errorText);
  }

  private async processInboxMediaGroupJob(job: ClaimedOutboxRow): Promise<void> {
    const mediaGroupId = job.media_group_id;
    if (!mediaGroupId) {
      return;
    }

    const groupWindow = await this.prisma.outbox.findMany({
      where: {
        mediaGroupId,
        sourceType: 'REPLY',
        messageType: MessageType.PHOTO,
        status: {
          in: [OutboxStatus.PENDING, OutboxStatus.PROCESSING],
        },
      },
      orderBy: [{ mediaGroupOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
      },
    });

    if (groupWindow.length === 0) {
      return;
    }

    if (groupWindow[0].id !== job.id) {
      return;
    }

    await this.claimPendingMediaGroupJobs(mediaGroupId);

    const albumJobs = await this.prisma.outbox.findMany({
      where: {
        mediaGroupId,
        sourceType: 'REPLY',
        messageType: MessageType.PHOTO,
        status: OutboxStatus.PROCESSING,
      },
      orderBy: [{ mediaGroupOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        userId: true,
        sourceType: true,
        messageType: true,
        text: true,
        caption: true,
        filePath: true,
        mimeType: true,
        originalFileName: true,
        mediaGroupId: true,
        mediaGroupOrder: true,
        attempts: true,
      },
    });

    if (albumJobs.length === 0) {
      return;
    }

    const userId = albumJobs[0].userId;
    if (!albumJobs.every((item) => item.userId === userId)) {
      await this.failMediaGroupJobs(albumJobs, 'Media group has inconsistent user mapping');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegramId: true,
        isBlocked: true,
      },
    });

    if (!user) {
      await this.failMediaGroupJobs(albumJobs, 'User not found');
      return;
    }

    if (user.isBlocked) {
      await this.failMediaGroupJobs(albumJobs, 'User is marked as blocked');
      return;
    }

    const filePaths: string[] = [];
    for (const albumJob of albumJobs) {
      if (!albumJob.filePath || !existsSync(albumJob.filePath)) {
        await this.failMediaGroupJobs(albumJobs, 'Photo file is missing on disk');
        return;
      }
      filePaths.push(albumJob.filePath);
    }

    let sendResult = await this.telegramService.sendMediaGroup(user.telegramId, filePaths);

    let rateLimitRetries = 0;
    while (
      !sendResult.success &&
      sendResult.isRateLimit &&
      rateLimitRetries < MAX_429_RETRIES_PER_CLAIM
    ) {
      const retryAfterSeconds = sendResult.retryAfterSeconds ?? 1;
      await this.logsService.warn(
        'outbox-worker',
        `Telegram 429 for mediaGroupId=${mediaGroupId}, retry_after=${retryAfterSeconds}s`,
      );
      await this.sleep((retryAfterSeconds + 1) * 1000);
      rateLimitRetries += 1;
      sendResult = await this.telegramService.sendMediaGroup(user.telegramId, filePaths);
    }

    if (sendResult.success) {
      await this.completeMediaGroupJobs(albumJobs, sendResult.telegramMessages, sendResult.rawPayload);
      return;
    }

    const canRequeue = albumJobs.every((item) => item.attempts < MAX_OUTBOX_ATTEMPTS);
    if (sendResult.isRateLimit && canRequeue) {
      await this.requeueMediaGroupJobs(albumJobs, sendResult.errorText);
      return;
    }

    await this.failMediaGroupJobs(albumJobs, sendResult.errorText);
  }

  private async completeJob(
    job: ClaimedOutboxRow,
    telegramMessageId: number,
    rawPayload: Prisma.InputJsonValue,
  ): Promise<void> {
    const photoIds =
      job.message_type === MessageType.PHOTO
        ? this.extractPhotoIds(rawPayload)
        : { fileId: null, fileUniqueId: null };

    const broadcastId = await this.prisma.$transaction(async (tx) => {
      await tx.outbox.update({
        where: { id: job.id },
        data: {
          status: OutboxStatus.SENT,
          sentAt: new Date(),
          processingStartedAt: null,
          errorText: null,
        },
      });

      await tx.message.create({
        data: {
          userId: job.user_id,
          telegramMessageId,
          direction: Direction.OUTGOING,
          messageType: job.message_type,
          text: job.message_type === MessageType.TEXT ? job.text : null,
          caption: job.message_type === MessageType.PHOTO ? job.caption : null,
          telegramFileId: photoIds.fileId,
          telegramFileUniqueId: photoIds.fileUniqueId,
          rawPayload,
          deliveryStatus: DeliveryStatus.SENT,
          isRead: true,
        },
      });

      const delivery = await tx.broadcastDelivery.findUnique({
        where: { outboxId: job.id },
        select: { broadcastId: true },
      });

      if (delivery) {
        await tx.broadcastDelivery.update({
          where: { outboxId: job.id },
          data: {
            status: BroadcastDeliveryStatus.SENT,
            errorText: null,
          },
        });
      }

      return delivery?.broadcastId ?? null;
    });

    await this.cleanupUploadedFile(job.id, job.source_type, job.message_type, job.file_path, 'sent');

    if (broadcastId) {
      await this.refreshBroadcastStats(broadcastId);
    }
  }

  private async requeueRateLimitedJob(job: ClaimedOutboxRow, errorText: string): Promise<void> {
    const broadcastId = await this.prisma.$transaction(async (tx) => {
      await tx.outbox.update({
        where: { id: job.id },
        data: {
          status: OutboxStatus.PENDING,
          processingStartedAt: null,
          errorText,
        },
      });

      const delivery = await tx.broadcastDelivery.findUnique({
        where: { outboxId: job.id },
        select: { broadcastId: true },
      });

      if (delivery) {
        await tx.broadcastDelivery.update({
          where: { outboxId: job.id },
          data: {
            status: BroadcastDeliveryStatus.PENDING,
            errorText: null,
          },
        });
      }

      return delivery?.broadcastId ?? null;
    });

    if (broadcastId) {
      await this.refreshBroadcastStats(broadcastId);
    }
  }

  private async claimPendingMediaGroupJobs(mediaGroupId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "outbox"
      SET "status" = 'PROCESSING',
          "processing_started_at" = NOW(),
          "attempts" = "attempts" + 1,
          "error_text" = NULL
      WHERE "media_group_id" = ${mediaGroupId}
        AND "source_type" = 'REPLY'
        AND "message_type" = 'PHOTO'
        AND "status" = 'PENDING';
    `;
  }

  private async completeMediaGroupJobs(
    albumJobs: Array<{
      id: number;
      userId: number;
      sourceType: 'REPLY' | 'BROADCAST';
      messageType: MessageType;
      text: string | null;
      caption: string | null;
      filePath: string | null;
      mimeType: string | null;
      originalFileName: string | null;
      mediaGroupId: string | null;
      mediaGroupOrder: number | null;
      attempts: number;
    }>,
    telegramMessages: Array<{
      telegramMessageId: number;
      rawPayload: Prisma.InputJsonValue;
    }>,
    rawPayload: Prisma.InputJsonValue,
  ): Promise<void> {
    if (telegramMessages.length !== albumJobs.length) {
      await this.failMediaGroupJobs(albumJobs, 'Telegram media group response size mismatch');
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (let index = 0; index < albumJobs.length; index += 1) {
        const albumJob = albumJobs[index];
        const sentMessage = telegramMessages[index];
        const photoIds = this.extractPhotoIds(sentMessage.rawPayload);

        await tx.outbox.update({
          where: { id: albumJob.id },
          data: {
            status: OutboxStatus.SENT,
            sentAt: new Date(),
            processingStartedAt: null,
            errorText: null,
          },
        });

        await tx.message.create({
          data: {
            userId: albumJob.userId,
            telegramMessageId: sentMessage.telegramMessageId,
            direction: Direction.OUTGOING,
            messageType: MessageType.PHOTO,
            text: null,
            caption: null,
            telegramFileId: photoIds.fileId,
            telegramFileUniqueId: photoIds.fileUniqueId,
            rawPayload: sentMessage.rawPayload,
            deliveryStatus: DeliveryStatus.SENT,
            isRead: true,
          },
        });
      }
    });

    for (const albumJob of albumJobs) {
      await this.cleanupUploadedFile(
        albumJob.id,
        albumJob.sourceType,
        albumJob.messageType,
        albumJob.filePath,
        'sent',
      );
    }

    try {
      await this.logsService.info(
        'outbox-worker',
        `Media group sent for userId=${albumJobs[0]?.userId}`,
        rawPayload,
      );
    } catch {
      // Do not fail completed processing because logging failed.
    }
  }

  private async requeueMediaGroupJobs(
    albumJobs: Array<{
      id: number;
    }>,
    errorText: string,
  ): Promise<void> {
    const ids = albumJobs.map((item) => item.id);
    if (ids.length === 0) {
      return;
    }

    await this.prisma.outbox.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: {
        status: OutboxStatus.PENDING,
        processingStartedAt: null,
        errorText,
      },
    });
  }

  private async failMediaGroupJobs(
    albumJobs: Array<{
      id: number;
      userId: number;
      sourceType: 'REPLY' | 'BROADCAST';
      messageType: MessageType;
      text: string | null;
      caption: string | null;
      filePath: string | null;
      mimeType: string | null;
      originalFileName: string | null;
      mediaGroupId: string | null;
      mediaGroupOrder: number | null;
      attempts: number;
    }>,
    errorText: string,
  ): Promise<void> {
    if (albumJobs.length === 0) {
      return;
    }

    const ids = albumJobs.map((item) => item.id);
    const shouldMarkBlocked = this.shouldMarkBlocked(errorText);
    const userId = albumJobs[0].userId;

    await this.prisma.$transaction(async (tx) => {
      await tx.outbox.updateMany({
        where: {
          id: {
            in: ids,
          },
        },
        data: {
          status: OutboxStatus.FAILED,
          errorText,
          processingStartedAt: null,
        },
      });

      for (const albumJob of albumJobs) {
        await tx.message.create({
          data: {
            userId: albumJob.userId,
            telegramMessageId: null,
            direction: Direction.OUTGOING,
            messageType: MessageType.PHOTO,
            text: null,
            caption: null,
            telegramFileId: null,
            telegramFileUniqueId: null,
            rawPayload: this.toJson({ error: errorText }),
            deliveryStatus: DeliveryStatus.FAILED,
            errorText,
            isRead: true,
          },
        });
      }

      if (shouldMarkBlocked) {
        await tx.user.update({
          where: { id: userId },
          data: { isBlocked: true },
        });
      }
    });

    for (const albumJob of albumJobs) {
      await this.cleanupUploadedFile(
        albumJob.id,
        albumJob.sourceType,
        albumJob.messageType,
        albumJob.filePath,
        'failed',
      );
    }
  }

  private async failJob(job: ClaimedOutboxRow, errorText: string): Promise<void> {
    const shouldMarkBlocked = this.shouldMarkBlocked(errorText);

    const broadcastId = await this.prisma.$transaction(async (tx) => {
      await tx.outbox.update({
        where: { id: job.id },
        data: {
          status: OutboxStatus.FAILED,
          errorText,
          processingStartedAt: null,
        },
      });

      await tx.message.create({
        data: {
          userId: job.user_id,
          telegramMessageId: null,
          direction: Direction.OUTGOING,
          messageType: job.message_type,
          text: job.message_type === MessageType.TEXT ? job.text : null,
          caption: job.message_type === MessageType.PHOTO ? job.caption : null,
          telegramFileId: null,
          telegramFileUniqueId: null,
          rawPayload: this.toJson({ error: errorText }),
          deliveryStatus: DeliveryStatus.FAILED,
          errorText,
          isRead: true,
        },
      });

      if (shouldMarkBlocked) {
        await tx.user.update({
          where: { id: job.user_id },
          data: { isBlocked: true },
        });
      }

      const delivery = await tx.broadcastDelivery.findUnique({
        where: { outboxId: job.id },
        select: { broadcastId: true },
      });

      if (delivery) {
        await tx.broadcastDelivery.update({
          where: { outboxId: job.id },
          data: {
            status: BroadcastDeliveryStatus.FAILED,
            errorText,
          },
        });
      }

      return delivery?.broadcastId ?? null;
    });

    await this.cleanupUploadedFile(job.id, job.source_type, job.message_type, job.file_path, 'failed');

    if (broadcastId) {
      await this.refreshBroadcastStats(broadcastId);
    }
  }

  private async refreshBroadcastStatsByOutboxIds(outboxIds: number[]): Promise<void> {
    if (outboxIds.length === 0) {
      return;
    }

    const rows = await this.prisma.broadcastDelivery.findMany({
      where: {
        outboxId: {
          in: outboxIds,
        },
      },
      select: {
        broadcastId: true,
      },
    });

    const uniqueBroadcastIds = Array.from(new Set(rows.map((row) => row.broadcastId)));
    for (const broadcastId of uniqueBroadcastIds) {
      await this.refreshBroadcastStats(broadcastId);
    }
  }

  private async refreshBroadcastStats(broadcastId: number): Promise<void> {
    const statsRows = await this.prisma.$queryRaw<BroadcastStatsRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'SENT')::int AS "success_count",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS "failed_count",
        COUNT(*) FILTER (WHERE "status" = 'PENDING')::int AS "pending_count",
        COUNT(*) FILTER (WHERE "status" = 'PROCESSING')::int AS "processing_count",
        COUNT(*)::int AS "total_count"
      FROM "broadcast_deliveries"
      WHERE "broadcast_id" = ${broadcastId};
    `;

    const stats = statsRows[0];
    if (!stats) {
      return;
    }

    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    if (!broadcast) {
      return;
    }

    const successCount = Number(stats.success_count);
    const failedCount = Number(stats.failed_count);
    const pendingCount = Number(stats.pending_count);
    const processingCount = Number(stats.processing_count);
    const totalCount = Number(stats.total_count);

    let status: BroadcastStatus;

    if (totalCount === 0) {
      status = BroadcastStatus.FINISHED;
    } else if (successCount === 0 && failedCount === 0 && processingCount === 0) {
      status = BroadcastStatus.PENDING;
    } else if (pendingCount > 0 || processingCount > 0) {
      status = BroadcastStatus.RUNNING;
    } else if (successCount === 0 && failedCount > 0) {
      status = BroadcastStatus.FAILED;
    } else {
      status = BroadcastStatus.FINISHED;
    }

    const finished =
      status === BroadcastStatus.FINISHED || status === BroadcastStatus.FAILED;

    await this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        totalTargets: totalCount,
        successCount,
        failedCount,
        status,
        startedAt:
          !broadcast.startedAt && status !== BroadcastStatus.PENDING
            ? new Date()
            : undefined,
        finishedAt:
          finished && !broadcast.finishedAt
            ? new Date()
            : undefined,
      },
    });
  }

  private shouldMarkBlocked(errorText: string): boolean {
    const normalized = errorText.toLowerCase();
    return (
      normalized.includes('forbidden') ||
      normalized.includes('chat not found') ||
      normalized.includes('bot was blocked by the user')
    );
  }

  private extractPhotoIds(rawPayload: Prisma.InputJsonValue): {
    fileId: string | null;
    fileUniqueId: string | null;
  } {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      return { fileId: null, fileUniqueId: null };
    }

    const payload = rawPayload as { photo?: Array<{ file_id?: string; file_unique_id?: string }> };
    if (!Array.isArray(payload.photo) || payload.photo.length === 0) {
      return { fileId: null, fileUniqueId: null };
    }

    const largest = payload.photo[payload.photo.length - 1];
    return {
      fileId: largest?.file_id ?? null,
      fileUniqueId: largest?.file_unique_id ?? null,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async cleanupUploadedFile(
    outboxId: number,
    sourceType: 'REPLY' | 'BROADCAST',
    messageType: MessageType,
    filePath: string | null,
    reason: 'sent' | 'failed' | 'stale-failed',
  ): Promise<void> {
    if (messageType !== MessageType.PHOTO || !filePath) {
      return;
    }

    try {
      if (sourceType === 'BROADCAST') {
        const remainingRows = await this.prisma.$queryRaw<Array<{ remaining: number }>>`
          SELECT COUNT(*)::int AS "remaining"
          FROM "outbox"
          WHERE "source_type" = 'BROADCAST'
            AND "message_type" = 'PHOTO'
            AND "file_path" = ${filePath}
            AND "status" IN ('PENDING', 'PROCESSING');
        `;

        const remaining = Number(remainingRows[0]?.remaining ?? 0);
        if (remaining > 0) {
          return;
        }
      }

      if (!existsSync(filePath)) {
        return;
      }

      await unlink(filePath);
    } catch (error) {
      await this.logsService.warn(
        'outbox-worker',
        `Failed to cleanup uploaded photo for outboxId=${outboxId} reason=${reason}`,
        {
          filePath,
          error: String(error),
        } as Prisma.InputJsonValue,
      );
    }
  }
}
