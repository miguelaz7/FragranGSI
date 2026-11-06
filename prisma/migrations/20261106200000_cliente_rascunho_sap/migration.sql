-- AlterTable
ALTER TABLE "User" ADD COLUMN "sapDraftUuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_sapDraftUuid_key" ON "User"("sapDraftUuid");
