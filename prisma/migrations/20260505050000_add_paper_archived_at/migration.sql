-- Add explicit archive metadata for papers. Visibility remains a publication
-- state, while archivedAt controls whether a paper is hidden from workflows.
ALTER TABLE "Paper" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Paper_archivedAt_idx" ON "Paper"("archivedAt");
