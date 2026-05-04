import { z } from "zod";

export const studyPlanTaskSchema = z.object({
  day: z.number().int().min(1).max(14),
  title: z.string().min(1),
  kind: z.enum(["practice", "paper", "wrong_note_review", "knowledge_review", "material_review"]),
  minutes: z.number().int().min(5).max(240),
  subjectId: z.string().optional(),
  knowledgeNodeIds: z.array(z.string()).default([]),
  paperId: z.string().optional(),
  materialId: z.string().optional()
});

export const studyPlanSchema = z.object({
  goalId: z.string().min(1),
  generatedAt: z.string().datetime(),
  days: z.literal(14),
  tasks: z.array(studyPlanTaskSchema).min(1)
});

export type StudyPlan = z.infer<typeof studyPlanSchema>;
