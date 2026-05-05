-- Add AI chat, learning diagnosis, and generated question candidate review tables.
ALTER TYPE "AiTaskType" ADD VALUE IF NOT EXISTS 'generate_practice_questions';

CREATE TABLE "AiChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "inputContextSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "aiCallId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningDiagnosis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "goalPath" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "weakKnowledgeNodeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceStats" JSONB,
    "aiCallId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningDiagnosis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedQuestionBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "goalPath" TEXT,
    "prompt" TEXT NOT NULL,
    "sourceContextType" TEXT,
    "sourceContextId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "aiCallId" TEXT,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedQuestionBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedQuestionCandidate" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "kind" "QuestionKind" NOT NULL DEFAULT 'single_choice',
    "stem" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "answerKey" JSONB NOT NULL,
    "explanation" TEXT,
    "difficulty" INTEGER,
    "knowledgeNodeId" TEXT,
    "sourceRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmedQuestionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedQuestionCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatThread_userId_updatedAt_idx" ON "AiChatThread"("userId", "updatedAt");
CREATE INDEX "AiChatThread_contextType_contextId_idx" ON "AiChatThread"("contextType", "contextId");
CREATE INDEX "AiChatMessage_threadId_createdAt_idx" ON "AiChatMessage"("threadId", "createdAt");
CREATE INDEX "LearningDiagnosis_userId_goalId_createdAt_idx" ON "LearningDiagnosis"("userId", "goalId", "createdAt");
CREATE INDEX "GeneratedQuestionBatch_userId_createdAt_idx" ON "GeneratedQuestionBatch"("userId", "createdAt");
CREATE INDEX "GeneratedQuestionBatch_status_idx" ON "GeneratedQuestionBatch"("status");
CREATE INDEX "GeneratedQuestionCandidate_batchId_status_idx" ON "GeneratedQuestionCandidate"("batchId", "status");
CREATE INDEX "GeneratedQuestionCandidate_confirmedQuestionId_idx" ON "GeneratedQuestionCandidate"("confirmedQuestionId");

ALTER TABLE "AiChatThread" ADD CONSTRAINT "AiChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningDiagnosis" ADD CONSTRAINT "LearningDiagnosis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedQuestionBatch" ADD CONSTRAINT "GeneratedQuestionBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedQuestionCandidate" ADD CONSTRAINT "GeneratedQuestionCandidate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GeneratedQuestionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
