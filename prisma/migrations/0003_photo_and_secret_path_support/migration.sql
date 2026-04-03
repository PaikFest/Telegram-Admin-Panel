-- AlterTable
ALTER TABLE "messages"
  ADD COLUMN "caption" TEXT,
  ADD COLUMN "telegram_file_id" VARCHAR(255),
  ADD COLUMN "telegram_file_unique_id" VARCHAR(255);

-- AlterTable
ALTER TABLE "outbox"
  ADD COLUMN "message_type" "MessageType" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "caption" TEXT,
  ADD COLUMN "file_path" TEXT,
  ADD COLUMN "mime_type" VARCHAR(255),
  ADD COLUMN "original_file_name" VARCHAR(255);

-- AlterTable
ALTER TABLE "outbox"
  ALTER COLUMN "text" DROP NOT NULL;
