-- CreateTable
CREATE TABLE "AiProviderPresetTask" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "taskType" "AiTaskType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiProviderPresetTask_pkey" PRIMARY KEY ("id")
);

-- Migrate the previous single default task route. If duplicate task routes
-- existed, keep the most recently updated preset to match the old resolver.
INSERT INTO "AiProviderPresetTask" ("id", "presetId", "taskType")
SELECT
    'preset_task_' || md5(random()::text || clock_timestamp()::text || "id"),
    "id",
    "defaultForTask"
FROM (
    SELECT DISTINCT ON ("defaultForTask")
        "id",
        "defaultForTask",
        "updatedAt"
    FROM "AiProviderPreset"
    WHERE "defaultForTask" IS NOT NULL
    ORDER BY "defaultForTask", "updatedAt" DESC
) AS migrated_routes;

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderPresetTask_taskType_key" ON "AiProviderPresetTask"("taskType");

-- CreateIndex
CREATE INDEX "AiProviderPresetTask_presetId_idx" ON "AiProviderPresetTask"("presetId");

-- AddForeignKey
ALTER TABLE "AiProviderPresetTask" ADD CONSTRAINT "AiProviderPresetTask_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "AiProviderPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropColumn
ALTER TABLE "AiProviderPreset" DROP COLUMN "defaultForTask";
