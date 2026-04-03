import { Module } from '@nestjs/common';
import { LogsModule } from '../logs/logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [PrismaModule, LogsModule],
  providers: [InboxService],
  controllers: [InboxController],
})
export class InboxModule {}
