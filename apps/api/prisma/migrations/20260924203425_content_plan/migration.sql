-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN     "permalink" TEXT;

-- CreateIndex
CREATE INDEX "ContentPost_status_scheduledAt_idx" ON "ContentPost"("status", "scheduledAt");
