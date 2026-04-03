-- RedefineEnum
CREATE TYPE "BroadcastDeliveryStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
ALTER TABLE "broadcast_deliveries" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "broadcast_deliveries" ALTER COLUMN "status" TYPE "BroadcastDeliveryStatus_new" USING ("status"::text::"BroadcastDeliveryStatus_new");
ALTER TYPE "BroadcastDeliveryStatus" RENAME TO "BroadcastDeliveryStatus_old";
ALTER TYPE "BroadcastDeliveryStatus_new" RENAME TO "BroadcastDeliveryStatus";
DROP TYPE "BroadcastDeliveryStatus_old";

-- CreateEnum
CREATE TYPE "OutboxSourceType" AS ENUM ('REPLY', 'BROADCAST');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "outbox" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "source_type" "OutboxSourceType" NOT NULL,
  "text" TEXT NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "error_text" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processing_started_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "broadcast_deliveries"
  ADD COLUMN "outbox_id" INTEGER,
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "outbox_status_created_at_idx" ON "outbox"("status", "created_at");
CREATE INDEX "outbox_processing_started_at_idx" ON "outbox"("processing_started_at");
CREATE INDEX "outbox_user_id_created_at_idx" ON "outbox"("user_id", "created_at");
CREATE UNIQUE INDEX "broadcast_deliveries_outbox_id_key" ON "broadcast_deliveries"("outbox_id");

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "outbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
