-- CreateEnum
CREATE TYPE "PracticeMode" AS ENUM ('new', 'wrong', 'retry_practiced', 'comprehensive');

-- AlterTable
ALTER TABLE "Attempt"
ADD COLUMN "practiceMode" "PracticeMode",
ADD COLUMN "practiceKnowledgeNodeId" TEXT,
ADD COLUMN "practiceMaterialId" TEXT;

-- CreateIndex
CREATE INDEX "Attempt_practiceMode_idx" ON "Attempt"("practiceMode");

-- CreateIndex
CREATE INDEX "Attempt_practiceKnowledgeNodeId_idx" ON "Attempt"("practiceKnowledgeNodeId");

-- CreateIndex
CREATE INDEX "Attempt_practiceMaterialId_idx" ON "Attempt"("practiceMaterialId");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_practiceKnowledgeNodeId_fkey" FOREIGN KEY ("practiceKnowledgeNodeId") REFERENCES "KnowledgeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_practiceMaterialId_fkey" FOREIGN KEY ("practiceMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
