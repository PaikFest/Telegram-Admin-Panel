-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'PHOTO', 'VIDEO', 'DOCUMENT', 'STICKER', 'AUDIO', 'VOICE', 'CONTACT', 'LOCATION', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('PENDING', 'RUNNING', 'FINISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "BroadcastDeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "admins" (
  "id" SERIAL NOT NULL,
  "login" VARCHAR(100) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
  "id" SERIAL NOT NULL,
  "telegram_id" VARCHAR(32) NOT NULL,
  "username" VARCHAR(100),
  "first_name" VARCHAR(100),
  "last_name" VARCHAR(100),
  "language_code" VARCHAR(20),
  "is_blocked" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "telegram_message_id" INTEGER,
  "direction" "Direction" NOT NULL,
  "message_type" "MessageType" NOT NULL,
  "text" TEXT,
  "raw_payload" JSONB NOT NULL,
  "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "error_text" TEXT,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
  "id" SERIAL NOT NULL,
  "title" TEXT,
  "text" TEXT NOT NULL,
  "status" "BroadcastStatus" NOT NULL DEFAULT 'PENDING',
  "total_targets" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_deliveries" (
  "id" SERIAL NOT NULL,
  "broadcast_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "status" "BroadcastDeliveryStatus" NOT NULL,
  "error_text" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "broadcast_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
  "id" SERIAL NOT NULL,
  "level" "LogLevel" NOT NULL DEFAULT 'INFO',
  "scope" VARCHAR(100) NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_login_key" ON "admins"("login");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");
CREATE INDEX "users_username_idx" ON "users"("username");
CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at");

-- CreateIndex
CREATE INDEX "messages_user_id_created_at_idx" ON "messages"("user_id", "created_at");
CREATE INDEX "messages_direction_is_read_idx" ON "messages"("direction", "is_read");

-- CreateIndex
CREATE INDEX "broadcasts_created_at_idx" ON "broadcasts"("created_at");

-- CreateIndex
CREATE INDEX "broadcast_deliveries_broadcast_id_idx" ON "broadcast_deliveries"("broadcast_id");
CREATE INDEX "broadcast_deliveries_user_id_idx" ON "broadcast_deliveries"("user_id");

-- CreateIndex
CREATE INDEX "system_logs_created_at_idx" ON "system_logs"("created_at");
CREATE INDEX "system_logs_level_idx" ON "system_logs"("level");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;