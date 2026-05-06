CREATE TYPE "MaterialLibraryScope" AS ENUM ('personal', 'platform');

ALTER TABLE "Material" ADD COLUMN "libraryScope" "MaterialLibraryScope" NOT NULL DEFAULT 'personal';

UPDATE "Material"
SET "libraryScope" = 'platform'
FROM "User"
WHERE "Material"."ownerId" = "User"."id"
  AND "User"."role" = 'admin';

UPDATE "Question" AS q
SET
  "ownerId" = NULL,
  "sourceType" = 'user_uploaded',
  "reviewStatus" = 'pending_review'
FROM "MaterialQuestionCandidate" AS c
JOIN "Material" AS m ON m."id" = c."materialId"
WHERE c."confirmedQuestionId" = q."id"
  AND m."libraryScope" = 'platform'
  AND q."sourceType" = 'ai_generated'
  AND q."visibility" = 'private'
  AND q."reviewStatus" = 'approved'
  AND q."ownerId" = m."ownerId";

UPDATE "QuestionVersion" AS qv
SET
  "sourceType" = 'user_uploaded',
  "reviewStatus" = 'pending_review'
FROM "Question" AS q
JOIN "MaterialQuestionCandidate" AS c ON c."confirmedQuestionId" = q."id"
JOIN "Material" AS m ON m."id" = c."materialId"
WHERE qv."questionId" = q."id"
  AND m."libraryScope" = 'platform'
  AND qv."sourceType" = 'ai_generated'
  AND qv."visibility" = 'private'
  AND qv."reviewStatus" = 'approved'
  AND q."ownerId" IS NULL;

CREATE INDEX "Material_libraryScope_idx" ON "Material"("libraryScope");
