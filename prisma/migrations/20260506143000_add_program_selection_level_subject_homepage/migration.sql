-- CreateEnum
CREATE TYPE "HomepageSelectionLevel" AS ENUM ('track', 'subject');

-- AlterTable
ALTER TABLE "ExamProgram"
ADD COLUMN "homepageSelectionLevel" "HomepageSelectionLevel" NOT NULL DEFAULT 'track';

-- AlterTable
ALTER TABLE "Subject"
ADD COLUMN "homepageStatus" "HomepageStatus" NOT NULL DEFAULT 'hidden',
ADD COLUMN "homepageOrder" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "homepageDescription" TEXT;

-- CreateIndex
CREATE INDEX "Subject_homepageStatus_homepageOrder_idx" ON "Subject"("homepageStatus", "homepageOrder");
