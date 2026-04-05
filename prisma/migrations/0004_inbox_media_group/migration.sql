-- AlterTable
ALTER TABLE "outbox"
  ADD COLUMN "media_group_id" VARCHAR(64),
  ADD COLUMN "media_group_order" INTEGER;

-- CreateIndex
CREATE INDEX "outbox_media_group_id_status_idx" ON "outbox"("media_group_id", "status");
