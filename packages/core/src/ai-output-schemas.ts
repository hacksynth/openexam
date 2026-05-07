import { z } from "zod";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)])
);

export const aiQuestionKindSchema = z.enum(["single_choice", "multiple_choice", "true_false", "blank", "short_answer", "case_analysis"]);

export const choiceOptionsObjectSchema = z.object({
  A: z.string().min(1),
  B: z.string().min(1),
  C: z.string().min(1),
  D: z.string().min(1)
});

export const richContentBlockSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string().min(1)
  }),
  z.object({
    type: z.literal("image"),
    sourceUrl: z.string().min(1),
    assetId: z.string().optional().nullable(),
    alt: z.string().optional().nullable()
  })
]);

export const choiceOptionRichObjectSchema = z.object({
  key: z.string().min(1),
  text: z.string().optional().nullable(),
  blocks: z.array(richContentBlockSchema).optional().nullable()
});

export const materialQuestionExtractionItemSchema = z.object({
  kind: aiQuestionKindSchema.optional().nullable(),
  stem: z.string().min(1),
  stemBlocks: z.array(richContentBlockSchema).optional().nullable(),
  options: choiceOptionsObjectSchema.optional(),
  optionBlocks: z.record(z.string(), z.array(richContentBlockSchema)).optional().nullable(),
  richOptions: z.array(choiceOptionRichObjectSchema).optional().nullable(),
  answer: z.union([z.string(), z.boolean(), z.array(z.string())]).optional().nullable(),
  payload: jsonValueSchema.optional().nullable(),
  answerKey: jsonValueSchema.optional().nullable(),
  rubric: jsonValueSchema.optional().nullable(),
  explanation: z.string().optional().nullable(),
  explanationBlocks: z.array(richContentBlockSchema).optional().nullable(),
  referenceAnswer: z.string().optional().nullable(),
  referenceAnswerBlocks: z.array(richContentBlockSchema).optional().nullable(),
  difficulty: z.number().int().min(1).max(5).optional().nullable(),
  knowledgeNodeId: z.string().optional().nullable(),
  sourceRef: z.string().optional().nullable()
});

export const materialQuestionExtractionSchema = z.object({
  questions: z.array(materialQuestionExtractionItemSchema).min(1)
});

export const subjectiveGradingOutputSchema = z.object({
  score: z.number().min(0),
  reason: z.string().optional(),
  rationale: z.string().optional()
});

export const learningDiagnosisOutputSchema = z.object({
  summary: z.string().min(1),
  weakKnowledgeNodeIds: z.array(z.string()).default([]),
  recommendations: z.array(z.string().min(1)).default([])
});

export const reviewCardImagePromptSchema = z.object({
  prompt: z.string().min(20).max(4000)
});

export function parseSubjectiveGradingOutput(value: string, maxScore: number): ActionResult<{ score: number; reason: string | null }> {
  const json = extractJsonObject(value);

  if (!json) {
    return { ok: false, error: "AI 主观题评分不是有效 JSON。" };
  }

  try {
    const parsed = subjectiveGradingOutputSchema.safeParse(JSON.parse(json));

    if (!parsed.success) {
      return { ok: false, error: "AI 主观题评分格式无效。" };
    }

    if (parsed.data.score > maxScore) {
      return { ok: false, error: "AI 主观题评分超过题目满分。" };
    }

    return {
      ok: true,
      data: {
        score: parsed.data.score,
        reason: parsed.data.reason ?? parsed.data.rationale ?? null
      }
    };
  } catch {
    return { ok: false, error: "AI 主观题评分不是有效 JSON。" };
  }
}

export function validateReviewCardImagePrompt(prompt: string): ActionResult<{ prompt: string }> {
  const parsed = reviewCardImagePromptSchema.safeParse({ prompt });

  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "AI 图片 Prompt 格式无效。" };
}

export function parseLearningDiagnosisOutput(value: string): ActionResult<z.infer<typeof learningDiagnosisOutputSchema>> {
  const json = extractJsonObject(value);

  if (!json) {
    return { ok: false, error: "AI 学习诊断不是有效 JSON。" };
  }

  try {
    const parsed = learningDiagnosisOutputSchema.safeParse(JSON.parse(json));

    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: "AI 学习诊断格式无效。" };
  } catch {
    return { ok: false, error: "AI 学习诊断不是有效 JSON。" };
  }
}

export function extractJsonObject(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : null;
}
