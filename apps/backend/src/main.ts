import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { sanitizePlainText } from './common/sanitize.util';
import { LogsService } from './logs/logs.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const appUrl = configService.getOrThrow<string>('APP_URL');
  const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');
  const adminBasePath = configService.getOrThrow<string>('ADMIN_BASE_PATH');
  const appOrigin = new URL(appUrl).origin;
  const useSecureCookie = appOrigin.startsWith('https://');
  const normalizedBasePath = adminBasePath.replace(/^\/+|\/+$/g, '');
  if (!normalizedBasePath) {
    throw new Error('ADMIN_BASE_PATH must not be empty');
  }
  const apiPrefix = `${normalizedBasePath}/api`;
  const loginRateLimitPath = `/${apiPrefix}/auth/login`;
  const logsService = app.get(LogsService);

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);
  expressApp.disable('x-powered-by');
  app.setGlobalPrefix(apiPrefix);

  app.use(helmet());
  app.enableCors({
    origin: appOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }

    const originHeader = req.headers.origin;
    const refererHeader = req.headers.referer;

    let valid = false;
    if (typeof originHeader === 'string' && originHeader.length > 0) {
      valid = originHeader === appOrigin;
    } else if (typeof refererHeader === 'string' && refererHeader.length > 0) {
      try {
        valid = new URL(refererHeader).origin === appOrigin;
      } catch {
        valid = false;
      }
    }

    if (!valid) {
      void logsService
        .warn(
        'security',
        `CSRF validation failed for ${req.method} ${req.originalUrl}`,
        {
          ip: req.ip,
          origin: originHeader ?? null,
          referer: refererHeader ?? null,
        },
        )
        .catch(() => undefined);
      res.status(403).json({ message: 'CSRF validation failed' });
      return;
    }

    next();
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
        secure: useSecureCookie,
        maxAge: 1000 * 60 * 60 * 24,
      },
    }),
  );

  app.use(
    loginRateLimitPath,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.ip ?? 'unknown',
      handler: (req, res) => {
        void logsService
          .warn('security', 'Login rate limit exceeded (IP)', {
            ip: req.ip,
            path: req.originalUrl,
          })
          .catch(() => undefined);
        res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
      },
      message: { message: 'Too many login attempts. Please try again later.' },
    }),
  );

  app.use(
    loginRateLimitPath,
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const rawLogin =
          req.body && typeof req.body.login === 'string' ? req.body.login : '';
        const login = sanitizePlainText(rawLogin).toLowerCase();
        return `${req.ip ?? 'unknown'}:${login}`;
      },
      handler: (req, res) => {
        const rawLogin =
          req.body && typeof req.body.login === 'string' ? req.body.login : '';
        const login = sanitizePlainText(rawLogin).toLowerCase();
        void logsService
          .warn('security', 'Login rate limit exceeded (IP+login)', {
            ip: req.ip,
            login,
            path: req.originalUrl,
          })
          .catch(() => undefined);
        res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
      },
      message: { message: 'Too many login attempts. Please try again later.' },
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
