-- AlterTable
ALTER TABLE "MetaConnection" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "MetaPendingSelection" ADD COLUMN     "type" "MetaConnectionType" NOT NULL DEFAULT 'INSTAGRAM';
