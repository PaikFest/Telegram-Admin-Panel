# Opener Bot Admin

Self-hosted universal admin panel for Telegram bot runtime.

## Scope
This project includes only:
- admin login/password auth (session cookie)
- Telegram long polling runtime
- outbox queue + worker-based outgoing delivery
- photo support in inbox (incoming preview + outgoing photo reply)
- secret admin base path for frontend and API
- user list
- inbox dialogs
- reply from bot
- broadcast to all users
- message history
- minimal logs

No VPN logic, Hiddify/3x-ui integration, payments, tariffs, subscriptions, Mini App, AI, webhook UI, or extra CRM features.

## Stack
- Backend: NestJS + TypeScript
- Frontend: Next.js + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Proxy: Caddy
- Deploy: Docker Compose
- Telegram mode: long polling (no webhook)

## Outgoing delivery flow
- Inbox reply does not send directly to Telegram API.
- Reply creates `outbox` job (`PENDING`).
- Broadcast creates one `outbox` job per user and links each to `broadcast_deliveries`.
- `OutboxWorkerService` atomically claims jobs (`PENDING -> PROCESSING`) with `FOR UPDATE SKIP LOCKED`.
- Worker sends messages via Telegram Bot API, writes `messages` history, updates outbox and broadcast delivery status.
- Stale `PROCESSING` jobs are recovered back to `PENDING` after timeout (default 5 minutes).
- Telegram `429` (`retry_after`) is handled with delay/backoff and controlled retry.
- Photo replies are queued in `outbox` and sent by worker via `sendPhoto`.

## Media flow
- Incoming Telegram photos are stored as `messages` with `messageType=PHOTO`, `caption`, `telegram_file_id`, `telegram_file_unique_id`.
- Photo preview is served only via backend proxy endpoint: `GET <ADMIN_BASE_PATH>/api/media/messages/:messageId/file`.
- Frontend never receives `BOT_TOKEN`.

## Monorepo layout
- `apps/backend`
- `apps/frontend`
- `prisma`
- `deploy`
- `scripts`

## Required environment variables
Only these variables are used:
- `BOT_TOKEN`
- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `SESSION_SECRET`
- `ADMIN_LOGIN`
- `ADMIN_PASSWORD`
- `ADMIN_PATH_TOKEN`
- `ADMIN_PATH_UUID`
- `ADMIN_BASE_PATH`
- `APP_URL`
- `NODE_ENV`

## One-line install
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/install.sh)
```

You can also pass repo and token explicitly:
```bash
REPO_URL="https://github.com/USER/REPO.git" BOT_TOKEN="<telegram_bot_token>" bash install.sh
```

## Server install/update/remove scripts
- `install.sh`
- `update.sh`
- `uninstall.sh`
- `reset-admin-password.sh`

## Update flow
```bash
cd /opt/opener-bot-admin && git pull && bash update.sh
```

## Reset admin credentials
```bash
cd /opt/opener-bot-admin && bash reset-admin-password.sh
```

## Local run (without install.sh)
1. Copy env:
```bash
cp .env.example .env
```
2. Fill `BOT_TOKEN` and secrets.
3. Start:
```bash
docker compose up -d --build
```
4. Open `http://<server-ip><ADMIN_BASE_PATH>/login`.

## Health checks
- Caddy: `GET /health`
- Backend: `GET <ADMIN_BASE_PATH>/api/health`
- Frontend: `GET <ADMIN_BASE_PATH>/health` on frontend container

## Security defaults
- password hashing: bcrypt
- Helmet enabled
- login rate limiting
- DTO validation (whitelist + forbid unknown)
- XSS sanitization for text inputs
- HttpOnly session cookie
- cookie `secure=false` for HTTP/IP mode
- CORS restricted to `APP_URL`

## Notes
- On first backend start, admin account is created from `ADMIN_LOGIN`/`ADMIN_PASSWORD` if DB has no admins.
- `install.sh` generates hidden admin path (`ADMIN_BASE_PATH`) and prints full Admin URL with login/password.
- `install.sh` writes generated credentials to `/root/opener-bot-admin-credentials.txt` with mode `600`.
