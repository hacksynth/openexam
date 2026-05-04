import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, QuestionKind, ReviewStatus, SourceType, Visibility } from "@prisma/client";
import { z } from "zod";
import { readEnv } from "./env";
import { prisma } from "./prisma";
import { singleChoiceAnswerKeys, type SingleChoiceAnswerKey } from "./question-admin";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type MaterialDatabase = typeof prisma;

export type UploadedMaterialFile = {
  name: string;
  type?: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type UploadMaterialInput = {
  title?: string | null;
  subjectId?: string | null;
  sourceLicense?: string | null;
  file: UploadedMaterialFile;
};

export const materialJobType = "extract_material_questions";
export const supportedMaterialExtensions = [".txt", ".md", ".pdf"] as const;
export const supportedMaterialMimeTypes = ["text/plain", "text/markdown", "application/pdf"] as const;

const candidateSchema = z.object({
  questions: z
    .array(
      z.object({
        stem: z.string().trim().min(1),
        options: z.object({
          A: z.string().trim().min(1),
          B: z.string().trim().min(1),
          C: z.string().trim().min(1),
          D: z.string().trim().min(1)
        }),
        answer: z.enum(singleChoiceAnswerKeys),
        explanation: z.string().trim().optional().nullable(),
        difficulty: z.number().int().min(1).max(5).optional().nullable(),
        knowledgeNodeId: z.string().trim().optional().nullable(),
        sourceRef: z.string().trim().optional().nullable()
      })
    )
    .min(1)
    .max(20)
});

export type ExtractedMaterialQuestion = z.infer<typeof candidateSchema>["questions"][number];

export async function uploadMaterial(userId: string, input: UploadMaterialInput, db: MaterialDatabase = prisma): Promise<ActionResult<{ materialId: string; jobId: string }>> {
  const file = input.file;
  const env = readEnv({ ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public" });
  const maxBytes = env.OPENEXAM_UPLOAD_MAX_BYTES;
  const mimeType = inferMaterialMimeType(file.name, file.type);

  if (!file || file.size <= 0) {
    return { ok: false, error: "请选择要上传的资料文件。" };
  }

  if (file.size > maxBytes) {
    return { ok: false, error: `资料文件不能超过 ${formatBytes(maxBytes)}。` };
  }

  if (!mimeType) {
    return { ok: false, error: "首版仅支持 .txt、.md、.pdf 资料。" };
  }

  const subjectId = optionalText(input.subjectId);
  const bindingScope = subjectId ? `subject:${subjectId}` : null;

  if (subjectId) {
    const subject = await db.subject.findUnique({ where: { id: subjectId }, select: { id: true } });

    if (!subject) {
      return { ok: false, error: "请选择有效的科目。" };
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `materials/${userId}/${randomUUID()}-${safeFileName(file.name)}`;
  const storagePath = resolveLocalStoragePath(storageKey);
  const title = optionalText(input.title) || stripExtension(file.name) || "未命名资料";

  await mkdir(path.dirname(storagePath), { recursive: true });
  await writeFile(storagePath, bytes);

  try {
    const result = await db.$transaction(async (tx) => {
      const material = await tx.material.create({
        data: {
          ownerId: userId,
          title,
          mimeType,
          sizeBytes: bytes.length,
          sha256,
          storageKey,
          bindingScope,
          extractionState: "queued",
          sourceLicense: optionalText(input.sourceLicense)
        }
      });
      await tx.asset.create({
        data: {
          ownerId: userId,
          materialId: material.id,
          visibility: Visibility.private,
          mimeType,
          sizeBytes: bytes.length,
          sha256,
          storageKey,
          source: "material_upload"
        }
      });
      const job = await tx.job.create({
        data: {
          type: materialJobType,
          userId,
          payload: {
            materialId: material.id
          },
          progress: 0
        }
      });

      return { materialId: material.id, jobId: job.id };
    });

    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: databaseErrorMessage(error, "资料上传失败。") };
  }
}

export async function listUserMaterials(userId: string, db: MaterialDatabase = prisma) {
  const materials = await db.material.findMany({
    where: { ownerId: userId },
    include: {
      candidates: true
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100
  });
  const jobs = await listMaterialJobs(materials.map((material) => material.id), db);

  return materials.map((material) => toMaterialView(material, jobs.get(material.id)));
}

export async function listAdminMaterials(db: MaterialDatabase = prisma) {
  const materials = await db.material.findMany({
    include: {
      owner: true,
      candidates: true
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100
  });
  const jobs = await listMaterialJobs(materials.map((material) => material.id), db);

  return materials.map((material) => ({
    ...toMaterialView(material, jobs.get(material.id)),
    ownerEmail: material.owner.email,
    ownerName: material.owner.name
  }));
}

export async function listMaterialQuestionCandidates(materialId: string | undefined, db: MaterialDatabase = prisma) {
  const candidates = await db.materialQuestionCandidate.findMany({
    where: materialId ? { materialId } : {},
    include: {
      material: {
        include: {
          owner: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100
  });

  return candidates.map((candidate) => ({
    id: candidate.id,
    materialId: candidate.materialId,
    materialTitle: candidate.material.title,
    ownerEmail: candidate.material.owner.email,
    stem: candidate.stem,
    options: readCandidateOptions(candidate.payload),
    answer: readCandidateAnswer(candidate.answerKey),
    explanation: candidate.explanation,
    difficulty: candidate.difficulty,
    knowledgeNodeId: candidate.knowledgeNodeId,
    sourceRef: candidate.sourceRef,
    status: candidate.status,
    confirmedQuestionId: candidate.confirmedQuestionId,
    createdAt: candidate.createdAt
  }));
}

export async function confirmMaterialQuestionCandidate(candidateId: string, db: MaterialDatabase = prisma): Promise<ActionResult<{ questionId: string }>> {
  const candidate = await db.materialQuestionCandidate.findUnique({
    where: { id: candidateId },
    include: {
      material: true
    }
  });

  if (!candidate) {
    return { ok: false, error: "候选题不存在。" };
  }

  if (candidate.status === "confirmed" || candidate.confirmedQuestionId) {
    return { ok: false, error: "候选题已确认。" };
  }

  if (!candidate.knowledgeNodeId) {
    return { ok: false, error: "候选题缺少知识点，暂不能确认。" };
  }

  const knowledgeNode = await db.knowledgeNode.findUnique({
    where: { id: candidate.knowledgeNodeId },
    select: { id: true }
  });

  if (!knowledgeNode) {
    return { ok: false, error: "候选题知识点无效，暂不能确认。" };
  }

  try {
    const question = await db.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          ownerId: candidate.material.ownerId,
          kind: QuestionKind.single_choice,
          stem: candidate.stem,
          payload: candidate.payload as Prisma.InputJsonValue,
          answerKey: candidate.answerKey as Prisma.InputJsonValue,
          explanation: candidate.explanation,
          difficulty: candidate.difficulty,
          sourceType: SourceType.ai_generated,
          sourceTitle: candidate.material.title,
          sourceLicense: candidate.material.sourceLicense,
          visibility: Visibility.private,
          reviewStatus: ReviewStatus.approved,
          currentVersion: 1,
          knowledgeBindings: {
            create: {
              knowledgeNodeId: candidate.knowledgeNodeId!,
              weight: 1,
              isPrimary: true
            }
          },
          versions: {
            create: {
              version: 1,
              stem: candidate.stem,
              payload: candidate.payload as Prisma.InputJsonValue,
              answerKey: candidate.answerKey as Prisma.InputJsonValue,
              explanation: candidate.explanation,
              sourceType: SourceType.ai_generated,
              visibility: Visibility.private,
              reviewStatus: ReviewStatus.approved
            }
          }
        }
      });
      await tx.materialQuestionCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "confirmed",
          confirmedQuestionId: created.id
        }
      });

      return created;
    });

    return { ok: true, data: { questionId: question.id } };
  } catch (error) {
    return { ok: false, error: databaseErrorMessage(error, "候选题确认失败。") };
  }
}

export async function readMaterialText(
  materialId: string,
  db: MaterialDatabase = prisma
): Promise<ActionResult<{ text: string; material: NonNullable<Awaited<ReturnType<typeof findMaterialForProcessing>>> }>> {
  const material = await findMaterialForProcessing(materialId, db);

  if (!material) {
    return { ok: false, error: "资料不存在。" };
  }

  if (material.mimeType === "application/pdf") {
    return { ok: false, error: "PDF 文本抽取暂不支持扫描件。" };
  }

  const filePath = resolveLocalStoragePath(material.storageKey);
  const buffer = await readFile(filePath);
  const text = buffer.toString("utf8").trim();

  if (!text) {
    return { ok: false, error: "资料文本为空，无法抽题。" };
  }

  return { ok: true, data: { text: text.slice(0, 16000), material } };
}

export async function createMaterialQuestionCandidates(materialId: string, jobId: string, questions: ExtractedMaterialQuestion[], db: MaterialDatabase = prisma) {
  await db.materialQuestionCandidate.deleteMany({
    where: {
      materialId,
      status: "pending"
    }
  });

  await db.materialQuestionCandidate.createMany({
    data: questions.map((question) => ({
      materialId,
      jobId,
      stem: question.stem,
      payload: {
        options: singleChoiceAnswerKeys.map((key) => ({
          key,
          text: question.options[key]
        }))
      },
      answerKey: {
        value: question.answer
      },
      explanation: optionalText(question.explanation),
      difficulty: question.difficulty ?? null,
      knowledgeNodeId: optionalText(question.knowledgeNodeId),
      sourceRef: optionalText(question.sourceRef)
    }))
  });
}

export function validateExtractedQuestionsJson(value: string): ActionResult<{ questions: ExtractedMaterialQuestion[] }> {
  try {
    const parsed = candidateSchema.safeParse(JSON.parse(value));

    if (!parsed.success) {
      return { ok: false, error: "AI 抽题结果格式无效。" };
    }

    return { ok: true, data: { questions: parsed.data.questions } };
  } catch {
    return { ok: false, error: "AI 抽题结果不是有效 JSON。" };
  }
}

export async function listMaterialKnowledgeOptions(bindingScope: string | null, db: MaterialDatabase = prisma) {
  const subjectId = parseSubjectBinding(bindingScope);

  if (!subjectId) {
    return db.knowledgeNode.findMany({
      orderBy: [{ code: "asc" }],
      take: 50
    });
  }

  return db.knowledgeNode.findMany({
    where: {
      syllabus: {
        subjectId
      }
    },
    orderBy: [{ code: "asc" }],
    take: 50
  });
}

export function buildMaterialExtractionPrompt(input: { title: string; text: string; knowledgeNodes: { id: string; code: string; title: string }[] }) {
  return {
    instructions:
      "你是 OpenExam 的资料抽题助手。只根据给定资料抽取单选题候选。必须输出严格 JSON，不要输出 Markdown。",
    input: [
      "请从资料中抽取 1-5 道单选题候选，输出 JSON：",
      '{"questions":[{"stem":"题干","options":{"A":"选项A","B":"选项B","C":"选项C","D":"选项D"},"answer":"A","explanation":"解析","difficulty":2,"knowledgeNodeId":"知识点ID","sourceRef":"页码或段落"}]}',
      "answer 只能是 A/B/C/D。knowledgeNodeId 必须从下列知识点中选择；无法判断时可为空。",
      "",
      `资料标题：${input.title}`,
      `可选知识点：${input.knowledgeNodes.map((node) => `${node.id} ${node.code} ${node.title}`).join(" / ") || "无"}`,
      "",
      "资料正文：",
      input.text
    ].join("\n")
  };
}

function findMaterialForProcessing(materialId: string, db: MaterialDatabase) {
  return db.material.findUnique({
    where: { id: materialId }
  });
}

async function listMaterialJobs(materialIds: string[], db: MaterialDatabase) {
  const jobs = materialIds.length
    ? await db.job.findMany({
        where: {
          type: materialJobType,
          createdAt: {
            gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
          }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 200
      })
    : [];
  const byMaterial = new Map<string, (typeof jobs)[number]>();
  const materialSet = new Set(materialIds);

  for (const job of jobs) {
    const materialId = readPayloadMaterialId(job.payload);

    if (materialId && materialSet.has(materialId) && !byMaterial.has(materialId)) {
      byMaterial.set(materialId, job);
    }
  }

  return byMaterial;
}

function toMaterialView(
  material: Prisma.MaterialGetPayload<{ include: { candidates: true } }>,
  job: Prisma.JobGetPayload<object> | undefined
) {
  return {
    id: material.id,
    title: material.title,
    mimeType: material.mimeType,
    sizeBytes: material.sizeBytes,
    bindingScope: material.bindingScope,
    extractionState: material.extractionState,
    sourceLicense: material.sourceLicense,
    candidateCount: material.candidates.length,
    pendingCandidateCount: material.candidates.filter((candidate) => candidate.status === "pending").length,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
    latestJob: job
      ? {
          id: job.id,
          status: job.status,
          error: job.error,
          progress: job.progress,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt
        }
      : null
  };
}

function inferMaterialMimeType(fileName: string, providedType: string | undefined) {
  const ext = path.extname(fileName).toLowerCase();

  if (providedType && supportedMaterialMimeTypes.includes(providedType as (typeof supportedMaterialMimeTypes)[number])) {
    return providedType;
  }

  if (ext === ".txt") {
    return "text/plain";
  }

  if (ext === ".md") {
    return "text/markdown";
  }

  if (ext === ".pdf") {
    return "application/pdf";
  }

  return null;
}

function resolveLocalStoragePath(storageKey: string) {
  const env = readEnv({ ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public" });
  const root = resolveLocalStorageRoot(env.LOCAL_STORAGE_DIR);

  return path.join(root, storageKey);
}

function resolveLocalStorageRoot(value: string) {
  if (path.isAbsolute(value)) {
    return value;
  }

  const cwd = /*turbopackIgnore: true*/ process.cwd();

  if (path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(/*turbopackIgnore: true*/ cwd, "../..", value);
  }

  return path.resolve(/*turbopackIgnore: true*/ cwd, value);
}

function safeFileName(value: string) {
  return (value || "material").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
}

function stripExtension(value: string) {
  return path.basename(value, path.extname(value));
}

function optionalText(value: string | null | undefined) {
  const text = value?.trim();

  return text || null;
}

function formatBytes(value: number) {
  return `${Math.ceil(value / 1024 / 1024)}MB`;
}

function parseSubjectBinding(value: string | null) {
  const prefix = "subject:";

  return value?.startsWith(prefix) ? value.slice(prefix.length) : null;
}

function readPayloadMaterialId(value: Prisma.JsonValue) {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.materialId === "string") {
    return value.materialId;
  }

  return null;
}

function readCandidateOptions(payload: Prisma.JsonValue) {
  const output: Record<SingleChoiceAnswerKey, string> = { A: "", B: "", C: "", D: "" };

  if (payload && typeof payload === "object" && !Array.isArray(payload) && Array.isArray(payload.options)) {
    for (const item of payload.options) {
      if (item && typeof item === "object" && !Array.isArray(item) && typeof item.key === "string" && typeof item.text === "string" && item.key in output) {
        output[item.key as SingleChoiceAnswerKey] = item.text;
      }
    }
  }

  return output;
}

function readCandidateAnswer(answerKey: Prisma.JsonValue) {
  if (answerKey && typeof answerKey === "object" && !Array.isArray(answerKey) && typeof answerKey.value === "string") {
    return answerKey.value;
  }

  return "";
}

function databaseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "资料记录已存在。";
  }

  return fallback;
}
