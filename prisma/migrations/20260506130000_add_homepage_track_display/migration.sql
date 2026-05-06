-- CreateEnum
CREATE TYPE "HomepageStatus" AS ENUM ('open', 'planned', 'hidden');

-- AlterTable
ALTER TABLE "ExamTrack"
ADD COLUMN "homepageStatus" "HomepageStatus" NOT NULL DEFAULT 'hidden',
ADD COLUMN "homepageOrder" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "homepageDescription" TEXT;

-- Seed the existing MVP track as the first open homepage entry.
UPDATE "ExamTrack"
SET
  "homepageStatus" = 'open',
  "homepageOrder" = 10,
  "homepageDescription" = '当前完整备考方向，覆盖基础知识与应用技术。'
FROM "ExamProgram"
WHERE "ExamTrack"."programId" = "ExamProgram"."id"
  AND "ExamProgram"."slug" = 'ruankao'
  AND "ExamTrack"."slug" = 'software-designer';

-- CreateIndex
CREATE INDEX "ExamTrack_homepageStatus_homepageOrder_idx" ON "ExamTrack"("homepageStatus", "homepageOrder");
