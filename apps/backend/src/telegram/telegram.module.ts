import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [PrismaModule, LogsModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}