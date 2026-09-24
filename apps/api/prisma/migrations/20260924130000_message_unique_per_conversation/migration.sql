-- DropIndex
DROP INDEX "IgMessage_externalId_key";

-- CreateIndex
CREATE UNIQUE INDEX "IgMessage_conversationId_externalId_key" ON "IgMessage"("conversationId", "externalId");

