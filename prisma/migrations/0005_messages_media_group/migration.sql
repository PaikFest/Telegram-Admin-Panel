-- AlterTable
ALTER TABLE "messages"
  ADD COLUMN "telegram_media_group_id" VARCHAR(128),
  ADD COLUMN "telegram_media_group_order" INTEGER;

-- CreateIndex
CREATE INDEX "messages_user_id_telegram_media_group_id_created_at_idx"
  ON "messages" ("user_id", "telegram_media_group_id", "created_at");
