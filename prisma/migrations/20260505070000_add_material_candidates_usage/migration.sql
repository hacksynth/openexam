-- AlterTable
ALTER TABLE "AiCall" ADD COLUMN "credentialSource" TEXT;

-- CreateTable
CREATE TABLE "MaterialQuestionCandidate" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "jobId" TEXT,
    "stem" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "answerKey" JSONB NOT NULL,
    "explanation" TEXT,
    "difficulty" INTEGER,
    "knowledgeNodeId" TEXT,
    "sourceRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmedQuestionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialQuestionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialQuestionCandidate_materialId_status_idx" ON "MaterialQuestionCandidate"("materialId", "status");

-- CreateIndex
CREATE INDEX "MaterialQuestionCandidate_jobId_idx" ON "MaterialQuestionCandidate"("jobId");

-- CreateIndex
CREATE INDEX "MaterialQuestionCandidate_confirmedQuestionId_idx" ON "MaterialQuestionCandidate"("confirmedQuestionId");

-- AddForeignKey
ALTER TABLE "MaterialQuestionCandidate" ADD CONSTRAINT "MaterialQuestionCandidate_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
