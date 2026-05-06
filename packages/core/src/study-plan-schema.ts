import { z } from "zod";

export const studyPlanTaskStatusSchema = z.enum(["pending", "completed", "carried_over", "skipped"]);

const scheduledDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const studyPlanTaskSchema = z.object({
  day: z.number().int().min(1).max(30),
  scheduledDate: scheduledDateSchema,
  title: z.string().min(1),
  kind: z.enum(["practice", "paper", "wrong_note_review", "knowledge_review", "material_review"]),
  minutes: z.number().int().min(5).max(240),
  subjectId: z.string().optional(),
  knowledgeNodeIds: z.array(z.string()).default([]),
  paperId: z.string().optional(),
  materialId: z.string().optional()
});

export const studyPlanDecisionSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(["carried_over", "skipped"]),
  reason: z.string().min(1).max(240).optional()
});

export const studyPlanSchema = z.object({
  goalId: z.string().min(1),
  generatedAt: z.string().datetime(),
  days: z.number().int().min(1).max(30),
  decisions: z.array(studyPlanDecisionSchema).default([]),
  tasks: z.array(studyPlanTaskSchema).min(1)
});

export type StudyPlan = z.infer<typeof studyPlanSchema>;
export type StudyPlanTaskStatus = z.infer<typeof studyPlanTaskStatusSchema>;
