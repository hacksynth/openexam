ALTER TABLE "UserProviderKey" ADD COLUMN "defaultModel" TEXT;

ALTER TABLE "AdminAiCredential" ADD COLUMN "defaultModel" TEXT;

UPDATE "AdminAiCredential"
SET "defaultModel" = "lastTestedModel"
WHERE "lastTestedModel" IS NOT NULL;
