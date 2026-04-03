import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BroadcastsModule } from './broadcasts/broadcasts.module';
import { HealthController } from './health/health.controller';
import { InboxModule } from './inbox/inbox.module';
import { LogsModule } from './logs/logs.module';
import { MediaModule } from './media/media.module';
import { OutboxModule } from './outbox/outbox.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LogsModule,
    AuthModule,
    TelegramModule,
    OutboxModule,
    MediaModule,
    UsersModule,
    InboxModule,
    BroadcastsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
