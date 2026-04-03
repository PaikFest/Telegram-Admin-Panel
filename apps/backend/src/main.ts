import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import { Pool } from 'pg';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const appUrl = configService.getOrThrow<string>('APP_URL');
  const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
  const adminBasePath = configService.getOrThrow<string>('ADMIN_BASE_PATH');
  const normalizedBasePath = adminBasePath.replace(/^\/+|\/+$/g, '');
  if (!normalizedBasePath) {
    throw new Error('ADMIN_BASE_PATH must not be empty');
  }
  const apiPrefix = `${normalizedBasePath}/api`;
  const loginRateLimitPath = `/${apiPrefix}/auth/login`;

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);
  app.setGlobalPrefix(apiPrefix);

  app.use(helmet());
  app.enableCors({
    origin: appUrl,
    credentials: true,
  });

  const PgStore = connectPgSimple(session);
  const pool = new Pool({ connectionString: databaseUrl });

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: 'admin_session',
        createTableIfMissing: true,
      }),
      name: 'opener.sid',
      secret: configService.getOrThrow<string>('SESSION_SECRET'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 1000 * 60 * 60 * 24,
      },
    }),
  );

  app.use(
    loginRateLimitPath,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: 'Too many login attempts. Please try again later.',
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(3001, '0.0.0.0');
}

bootstrap();
