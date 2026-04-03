import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';

@Module({
  imports: [PrismaModule, LogsModule],
  providers: [BroadcastsService],
  controllers: [BroadcastsController],
})
export class BroadcastsModule {}
