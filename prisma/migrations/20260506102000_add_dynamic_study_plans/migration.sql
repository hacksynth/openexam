-- Add rolling-window study plan metadata, task scheduling state, and revision history.
ALTER TABLE "StudyPlan"
ADD COLUMN "windowStartDate" TIMESTAMP(3),
ADD COLUMN "windowEndDate" TIMESTAMP(3),
ADD COLUMN "targetDateSnapshot" TIMESTAMP(3),
ADD COLUMN "dailyMinutesSnapshot" INTEGER,
ADD COLUMN "lastAdjustedAt" TIMESTAMP(3);

ALTER TABLE "StudyPlanTask"
ADD COLUMN "scheduledDate" TIMESTAMP(3),
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';

UPDATE "StudyPlanTask"
SET "scheduledDate" = "StudyPlan"."generatedAt" + (("StudyPlanTask"."day" - 1) * INTERVAL '1 day')
FROM "StudyPlan"
WHERE "StudyPlanTask"."planId" = "StudyPlan"."id"
  AND "StudyPlanTask"."scheduledDate" IS NULL;

UPDATE "StudyPlanTask"
SET "status" = CASE
  WHEN "completedAt" IS NOT NULL THEN 'completed'
  ELSE 'pending'
END;

CREATE TABLE "StudyPlanRevision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "windowStartDate" TIMESTAMP(3) NOT NULL,
    "windowEndDate" TIMESTAMP(3) NOT NULL,
    "targetDateSnapshot" TIMESTAMP(3) NOT NULL,
    "dailyMinutesSnapshot" INTEGER NOT NULL,
    "sourceStats" JSONB,
    "aiCallId" TEXT,
    "decisionSummary" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyPlanRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudyPlanRevision_planId_revisionNumber_key" ON "StudyPlanRevision"("planId", "revisionNumber");
CREATE INDEX "StudyPlanRevision_planId_createdAt_idx" ON "StudyPlanRevision"("planId", "createdAt");
CREATE INDEX "StudyPlanRevision_aiCallId_idx" ON "StudyPlanRevision"("aiCallId");
CREATE INDEX "StudyPlanTask_planId_scheduledDate_idx" ON "StudyPlanTask"("planId", "scheduledDate");
CREATE INDEX "StudyPlanTask_status_idx" ON "StudyPlanTask"("status");

ALTER TABLE "StudyPlanRevision" ADD CONSTRAINT "StudyPlanRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StudyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
