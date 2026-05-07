ALTER TYPE "PracticeMode" ADD VALUE IF NOT EXISTS 'consolidation';

CREATE TABLE "ConsolidationNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "attemptAnswerId" TEXT,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsolidationNote_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ConsolidationNote" (
    "id",
    "userId",
    "questionId",
    "attemptAnswerId",
    "mastered",
    "lastReviewedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "userId",
    "questionId",
    "attemptAnswerId",
    "mastered",
    "lastReviewedAt",
    "createdAt",
    "updatedAt"
FROM "WrongNote"
WHERE "errorCount" = 0
ON CONFLICT DO NOTHING;

DELETE FROM "WrongNote"
WHERE "errorCount" = 0;

CREATE UNIQUE INDEX "ConsolidationNote_userId_questionId_key" ON "ConsolidationNote"("userId", "questionId");
CREATE INDEX "ConsolidationNote_userId_mastered_idx" ON "ConsolidationNote"("userId", "mastered");
CREATE INDEX "ConsolidationNote_questionId_idx" ON "ConsolidationNote"("questionId");
CREATE INDEX "ConsolidationNote_attemptAnswerId_idx" ON "ConsolidationNote"("attemptAnswerId");

ALTER TABLE "ConsolidationNote" ADD CONSTRAINT "ConsolidationNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsolidationNote" ADD CONSTRAINT "ConsolidationNote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsolidationNote" ADD CONSTRAINT "ConsolidationNote_attemptAnswerId_fkey" FOREIGN KEY ("attemptAnswerId") REFERENCES "AttemptAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
