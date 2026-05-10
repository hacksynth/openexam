ALTER TABLE "UserProviderKey" ADD COLUMN "baseUrl" TEXT;
ALTER TABLE "UserProviderKey" ADD COLUMN "apiMode" TEXT;

CREATE TABLE "AdminAiCredential" (
    "id" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyHint" TEXT,
    "baseUrl" TEXT NOT NULL,
    "apiMode" TEXT,
    "lastTestedModel" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAiCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAiCredential_provider_key" ON "AdminAiCredential"("provider");
CREATE INDEX "AdminAiCredential_updatedById_idx" ON "AdminAiCredential"("updatedById");

ALTER TABLE "AdminAiCredential" ADD CONSTRAINT "AdminAiCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
