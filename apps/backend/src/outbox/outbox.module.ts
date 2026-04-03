import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OutboxWorkerService } from './outbox-worker.service';

@Module({
  imports: [PrismaModule, LogsModule, TelegramModule],
  providers: [OutboxWorkerService],
})
export class OutboxModule {}
