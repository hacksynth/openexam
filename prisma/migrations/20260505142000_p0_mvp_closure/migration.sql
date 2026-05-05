-- Material extraction observability.
ALTER TABLE "Material"
  ADD COLUMN "extractionMethod" TEXT,
  ADD COLUMN "extractionError" TEXT;

-- Candidate questions now preserve their extracted type.
ALTER TABLE "MaterialQuestionCandidate"
  ADD COLUMN "kind" "QuestionKind" NOT NULL DEFAULT 'single_choice';

-- Attempts can be paused/resumed without losing the answer state.
CREATE TABLE "AttemptPause" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "pausedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resumedAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttemptPause_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttemptPause_attemptId_pausedAt_idx" ON "AttemptPause"("attemptId", "pausedAt");

ALTER TABLE "AttemptPause"
  ADD CONSTRAINT "AttemptPause_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wrong notes can also represent manual collection of correct questions.
ALTER TABLE "WrongNote"
  ADD COLUMN "manualCollectedAt" TIMESTAMP(3);

-- Learner notes and generated explanations for knowledge nodes.
CREATE TABLE "UserKnowledgeNote" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "knowledgeNodeId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "aiExplanation" TEXT,
  "aiCallId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserKnowledgeNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserKnowledgeNote_userId_knowledgeNodeId_key" ON "UserKnowledgeNote"("userId", "knowledgeNodeId");
CREATE INDEX "UserKnowledgeNote_knowledgeNodeId_idx" ON "UserKnowledgeNote"("knowledgeNodeId");

ALTER TABLE "UserKnowledgeNote"
  ADD CONSTRAINT "UserKnowledgeNote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserKnowledgeNote"
  ADD CONSTRAINT "UserKnowledgeNote_knowledgeNodeId_fkey"
  FOREIGN KEY ("knowledgeNodeId") REFERENCES "KnowledgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
