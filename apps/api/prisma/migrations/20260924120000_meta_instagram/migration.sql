-- DropIndex
DROP INDEX "IgConversation_schoolId_externalId_key";

-- AlterTable
ALTER TABLE "IgConversation" ALTER COLUMN "externalId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MetaConnection" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "pageId" TEXT;

-- CreateTable
CREATE TABLE "MetaPendingSelection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaPendingSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IgConversation_schoolId_participantId_key" ON "IgConversation"("schoolId", "participantId");

-- AddForeignKey
ALTER TABLE "MetaPendingSelection" ADD CONSTRAINT "MetaPendingSelection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

