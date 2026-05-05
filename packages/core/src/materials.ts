import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, QuestionKind, ReviewStatus, SourceType, Visibility } from "@prisma/client";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import type { AiTextInputPart } from "./ai";
import { readEnv } from "./env";
import { prisma } from "./prisma";
import { singleChoiceAnswerKeys, type SingleChoiceAnswerKey } from "./question-admin";
import { resolveLocalStoragePath } from "./storage";

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

export type MaterialQuestionCandidateUpdateInput = {
  kind?: string | null;
  stem: string;
  optionA?: string | null;
  optionB?: string | null;
  optionC?: string | null;
  optionD?: string | null;
  answer?: string | null;
  payloadJson?: string | null;
  answerKeyJson?: string | null;
  explanation?: string | null;
  difficulty?: string | number | null;
  knowledgeNodeId?: string | null;
  sourceRef?: string | null;
};

export const materialJobType = "extract_material_questions";
export const supportedMaterialExtensions = [".txt", ".md", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"] as const;
export const supportedMaterialMimeTypes = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;
export const materialQuestionKinds = ["single_choice", "multiple_choice", "true_false", "blank", "short_answer", "case_analysis"] as const;

const extractedQuestionEnvelopeSchema = z.object({
  questions: z.array(z.unknown()).min(1).max(20)
});

export type ExtractedMaterialQuestion = {
  kind?: string | null;
  stem: string;
  options?: Record<SingleChoiceAnswerKey, string>;
  answer?: string | string[] | boolean | null;
  payload?: Prisma.JsonValue | null;
  answerKey?: Prisma.JsonValue | null;
  rubric?: Prisma.JsonValue | null;
  explanation?: string | null;
  difficulty?: number | null;
  knowledgeNodeId?: string | null;
  sourceRef?: string | null;
};

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
    return { ok: false, error: "支持 .txt、.md、.pdf、.docx、.png、.jpg、.jpeg、.webp 资料。" };
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
          extractionMethod: null,
          extractionError: null,
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
    kind: candidate.kind,
    stem: candidate.stem,
    options: readCandidateOptions(candidate.payload),
    answer: readCandidateAnswer(candidate.answerKey),
    payload: candidate.payload,
    answerKey: candidate.answerKey,
    explanation: candidate.explanation,
    difficulty: candidate.difficulty,
    knowledgeNodeId: candidate.knowledgeNodeId,
    sourceRef: candidate.sourceRef,
    status: candidate.status,
    confirmedQuestionId: candidate.confirmedQuestionId,
    createdAt: candidate.createdAt
  }));
}

export async function updateMaterialQuestionCandidate(candidateId: string, input: MaterialQuestionCandidateUpdateInput, db: MaterialDatabase = prisma): Promise<ActionResult> {
  const candidate = await db.materialQuestionCandidate.findUnique({
    where: { id: candidateId.trim() },
    select: {
      id: true,
      status: true
    }
  });

  if (!candidate) {
    return { ok: false, error: "候选题不存在。" };
  }

  if (candidate.status === "confirmed") {
    return { ok: false, error: "已确认候选题不能编辑。" };
  }

  const parsed = parseCandidateUpdateInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  await db.materialQuestionCandidate.update({
    where: { id: candidate.id },
    data: parsed.data
  });

  return { ok: true };
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
          kind: candidate.kind,
          stem: candidate.stem,
          payload: candidate.payload as Prisma.InputJsonValue,
          answerKey: candidate.answerKey as Prisma.InputJsonValue,
          explanation: candidate.explanation,
          difficulty: candidate.difficulty,
          sourceType: SourceType.ai_generated,
          sourceTitle: formatMaterialSourceTitle(candidate.material.title, candidate.sourceRef),
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
): Promise<ActionResult<{ text: string; extractionMethod: string; ocrInput?: AiTextInputPart; material: NonNullable<Awaited<ReturnType<typeof findMaterialForProcessing>>> }>> {
  const material = await findMaterialForProcessing(materialId, db);

  if (!material) {
    return { ok: false, error: "资料不存在。" };
  }

  const filePath = resolveLocalStoragePath(material.storageKey);
  const buffer = await readFile(filePath);

  if (material.mimeType === "text/plain" || material.mimeType === "text/markdown") {
    const text = buffer.toString("utf8").trim();

    if (!text) {
      return { ok: false, error: "资料文本为空，无法抽题。" };
    }

    return { ok: true, data: { text: text.slice(0, 16000), extractionMethod: "local_text", material } };
  }

  if (material.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (!text) {
      return { ok: false, error: "DOCX 未抽取到有效文本。" };
    }

    return { ok: true, data: { text: text.slice(0, 16000), extractionMethod: "local_docx", material } };
  }

  if (material.mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text.trim();

    if (text) {
      return { ok: true, data: { text: text.slice(0, 16000), extractionMethod: "local_pdf", material } };
    }

    return {
      ok: true,
      data: {
        text: "",
        extractionMethod: "ai_ocr",
        ocrInput: {
          type: "document",
          mimeType: material.mimeType,
          dataBase64: buffer.toString("base64"),
          filename: material.title
        },
        material
      }
    };
  }

  if (material.mimeType.startsWith("image/")) {
    return {
      ok: true,
      data: {
        text: "",
        extractionMethod: "ai_ocr",
        ocrInput: {
          type: "image",
          mimeType: material.mimeType,
          dataBase64: buffer.toString("base64"),
          filename: material.title
        },
        material
      }
    };
  }

  return { ok: false, error: "资料格式暂不支持。" };
}

export async function createMaterialQuestionCandidates(materialId: string, jobId: string, questions: ExtractedMaterialQuestion[], db: MaterialDatabase = prisma) {
  await db.materialQuestionCandidate.deleteMany({
    where: {
      materialId,
      status: "pending"
    }
  });

  await db.materialQuestionCandidate.createMany({
    data: questions.map((question) => {
      const storage = toCandidateStorage(question);

      return {
        materialId,
        jobId,
        kind: storage.kind,
        stem: storage.stem,
        payload: storage.payload,
        answerKey: storage.answerKey,
        explanation: optionalText(question.explanation),
        difficulty: question.difficulty ?? null,
        knowledgeNodeId: optionalText(question.knowledgeNodeId),
        sourceRef: optionalText(question.sourceRef)
      };
    })
  });
}

export function validateExtractedQuestionsJson(value: string): ActionResult<{ questions: ExtractedMaterialQuestion[] }> {
  try {
    const parsed = extractedQuestionEnvelopeSchema.safeParse(JSON.parse(value));

    if (!parsed.success) {
      return { ok: false, error: "AI 抽题结果格式无效。" };
    }

    const questions: ExtractedMaterialQuestion[] = [];

    for (const item of parsed.data.questions) {
      const question = parseExtractedQuestion(item);

      if (!question.ok) {
        return { ok: false, error: "AI 抽题结果格式无效。" };
      }

      questions.push(question.data);
    }

    return {
      ok: true,
      data: {
        questions
      }
    };
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
      "你是 OpenExam 的资料抽题助手。只根据给定资料抽取题目候选。必须输出严格 JSON，不要输出 Markdown。",
    input: [
      "请从资料中抽取 1-8 道候选题，题型可为 single_choice、multiple_choice、true_false、blank、short_answer、case_analysis。",
      "输出 JSON：",
      '{"questions":[{"kind":"single_choice","stem":"题干","options":{"A":"选项A","B":"选项B","C":"选项C","D":"选项D"},"answer":"A","explanation":"解析","difficulty":2,"knowledgeNodeId":"知识点ID","sourceRef":"页码或段落"}]}',
      "单选 answer 为 A/B/C/D；多选 answer 为数组；判断 answer 为 true/false；填空 answer 可为字符串或字符串数组；主观题可给 answerKey/rubric。",
      "knowledgeNodeId 必须从下列知识点中选择；无法判断时可为空。",
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

function parseExtractedQuestion(value: unknown): ActionResult<ExtractedMaterialQuestion> {
  if (!isPlainObject(value)) {
    return { ok: false, error: "AI 抽题结果格式无效。" };
  }

  const stem = textValue(value.stem);
  const kind = parseMaterialQuestionKind(textValue(value.kind)) ?? QuestionKind.single_choice;
  const difficulty = parseDifficultyValue(value.difficulty);
  const options = parseOptions(value.options);
  const answer = parseAnswerValue(value.answer);
  const payload = isJsonValue(value.payload) ? value.payload : null;
  const answerKey = isJsonValue(value.answerKey) ? value.answerKey : null;
  const rubric = isJsonValue(value.rubric) ? value.rubric : null;

  if (!stem) {
    return { ok: false, error: "AI 抽题结果格式无效。" };
  }

  if (kind === QuestionKind.single_choice) {
    if (!options || !singleChoiceAnswerKeys.includes(String(answer).toUpperCase() as SingleChoiceAnswerKey)) {
      return { ok: false, error: "AI 抽题结果格式无效。" };
    }

    return {
      ok: true,
      data: {
        stem,
        options,
        answer: String(answer).toUpperCase(),
        explanation: optionalText(textValue(value.explanation)),
        difficulty,
        knowledgeNodeId: optionalText(textValue(value.knowledgeNodeId)),
        sourceRef: optionalText(textValue(value.sourceRef))
      }
    };
  }

  return {
    ok: true,
    data: {
      kind,
      stem,
      ...(options ? { options } : {}),
      answer,
      payload,
      answerKey,
      rubric,
      explanation: optionalText(textValue(value.explanation)),
      difficulty,
      knowledgeNodeId: optionalText(textValue(value.knowledgeNodeId)),
      sourceRef: optionalText(textValue(value.sourceRef))
    }
  };
}

function parseCandidateUpdateInput(input: MaterialQuestionCandidateUpdateInput): ActionResult<Prisma.MaterialQuestionCandidateUpdateInput> {
  const kind = parseMaterialQuestionKind(input.kind ?? "") ?? QuestionKind.single_choice;
  const stem = input.stem.trim();
  const difficulty = parseDifficultyValue(input.difficulty);
  const explanation = optionalText(input.explanation);
  const knowledgeNodeId = optionalText(input.knowledgeNodeId);
  const sourceRef = optionalText(input.sourceRef);

  if (!stem) {
    return { ok: false, error: "题干不能为空。" };
  }

  if (kind === QuestionKind.single_choice || kind === QuestionKind.multiple_choice) {
    const options = {
      A: String(input.optionA ?? "").trim(),
      B: String(input.optionB ?? "").trim(),
      C: String(input.optionC ?? "").trim(),
      D: String(input.optionD ?? "").trim()
    };
    const answer = String(input.answer ?? "").trim();

    if (singleChoiceAnswerKeys.some((key) => !options[key])) {
      return { ok: false, error: "选项 A/B/C/D 都必须填写。" };
    }

    if (kind === QuestionKind.single_choice && !singleChoiceAnswerKeys.includes(answer.toUpperCase() as SingleChoiceAnswerKey)) {
      return { ok: false, error: "单选题答案只能是 A/B/C/D。" };
    }

    const answerValues = kind === QuestionKind.multiple_choice ? answer.split(/[,\s]+/).map((item) => item.toUpperCase()).filter(Boolean) : null;

    if (kind === QuestionKind.multiple_choice && (!answerValues?.length || answerValues.some((value) => !singleChoiceAnswerKeys.includes(value as SingleChoiceAnswerKey)))) {
      return { ok: false, error: "多选题答案请用 A/B/C/D 组合，以逗号或空格分隔。" };
    }

    return {
      ok: true,
      data: {
        kind,
        stem,
        payload: {
          options: singleChoiceAnswerKeys.map((key) => ({
            key,
            text: options[key]
          }))
        },
        answerKey: kind === QuestionKind.multiple_choice ? { values: answerValues } : { value: answer.toUpperCase() },
        explanation,
        difficulty,
        knowledgeNodeId,
        sourceRef
      }
    };
  }

  const payload = parseOptionalJson(input.payloadJson, "payload JSON");
  const answerKey = parseOptionalJson(input.answerKeyJson, "answerKey JSON");

  if (!payload.ok) {
    return payload;
  }

  if (!answerKey.ok) {
    return answerKey;
  }

  return {
    ok: true,
    data: {
      kind,
      stem,
      payload: payload.data ?? defaultPayloadForKind(kind),
      answerKey: answerKey.data ?? {},
      explanation,
      difficulty,
      knowledgeNodeId,
      sourceRef
    }
  };
}

function parseOptionalJson(value: string | null | undefined, label: string): ActionResult<Prisma.InputJsonValue | null> {
  const text = value?.trim();

  if (!text) {
    return { ok: true, data: null };
  }

  try {
    const parsed = JSON.parse(text);

    if (!isJsonValue(parsed)) {
      return { ok: false, error: `${label} 格式无效。` };
    }

    return { ok: true, data: parsed as Prisma.InputJsonValue };
  } catch {
    return { ok: false, error: `${label} 不是有效 JSON。` };
  }
}

function toCandidateStorage(question: ExtractedMaterialQuestion): {
  kind: QuestionKind;
  stem: string;
  payload: Prisma.InputJsonValue;
  answerKey: Prisma.InputJsonValue;
} {
  const kind = parseMaterialQuestionKind(question.kind ?? "") ?? QuestionKind.single_choice;

  if (kind === QuestionKind.single_choice && question.options) {
    return {
      kind,
      stem: question.stem,
      payload: {
        options: singleChoiceAnswerKeys.map((key) => ({
          key,
          text: question.options?.[key] ?? ""
        }))
      },
      answerKey: {
        value: String(question.answer ?? "").toUpperCase()
      }
    };
  }

  if (kind === QuestionKind.multiple_choice && question.options) {
    return {
      kind,
      stem: question.stem,
      payload: {
        options: singleChoiceAnswerKeys.map((key) => ({
          key,
          text: question.options?.[key] ?? ""
        }))
      },
      answerKey: normalizeAnswerKey(question.answerKey, question.answer)
    };
  }

  return {
    kind,
    stem: question.stem,
    payload: toInputJsonValue(question.payload) ?? defaultPayloadForKind(kind),
    answerKey: normalizeAnswerKey(question.answerKey, question.answer)
  };
}

function parseMaterialQuestionKind(value: string) {
  return materialQuestionKinds.includes(value as (typeof materialQuestionKinds)[number]) ? (value as QuestionKind) : null;
}

function parseOptions(value: unknown) {
  if (!isPlainObject(value)) {
    return null;
  }

  const options = {
    A: textValue(value.A ?? value.a),
    B: textValue(value.B ?? value.b),
    C: textValue(value.C ?? value.c),
    D: textValue(value.D ?? value.d)
  };

  return singleChoiceAnswerKeys.every((key) => options[key]) ? options : null;
}

function parseAnswerValue(value: unknown): ExtractedMaterialQuestion["answer"] {
  if (Array.isArray(value)) {
    return value.map((item) => textValue(item)).filter(Boolean);
  }

  if (typeof value === "boolean") {
    return value;
  }

  return textValue(value) || null;
}

function parseDifficultyValue(value: unknown) {
  const difficulty = typeof value === "number" ? value : Number(textValue(value));

  return Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null;
}

function normalizeAnswerKey(answerKey: Prisma.JsonValue | null | undefined, answer: ExtractedMaterialQuestion["answer"]): Prisma.InputJsonValue {
  const fromAnswerKey = toInputJsonValue(answerKey);

  if (fromAnswerKey) {
    return fromAnswerKey;
  }

  if (Array.isArray(answer)) {
    return { values: answer };
  }

  if (answer !== null && answer !== undefined && answer !== "") {
    return { value: answer };
  }

  return {};
}

function defaultPayloadForKind(kind: QuestionKind): Prisma.InputJsonValue {
  if (kind === QuestionKind.true_false) {
    return {
      options: [
        { key: "true", text: "正确" },
        { key: "false", text: "错误" }
      ]
    };
  }

  return {};
}

function toInputJsonValue(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
    extractionMethod: material.extractionMethod,
    extractionError: material.extractionError,
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

  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (ext === ".png") {
    return "image/png";
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }

  if (ext === ".webp") {
    return "image/webp";
  }

  return null;
}

function safeFileName(value: string) {
  return (value || "material").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100);
}

function stripExtension(value: string) {
  return path.basename(value, path.extname(value));
}

function formatMaterialSourceTitle(title: string, sourceRef: string | null) {
  return sourceRef ? `${title} · ${sourceRef}` : title;
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

  if (answerKey && typeof answerKey === "object" && !Array.isArray(answerKey) && Array.isArray(answerKey.values)) {
    return answerKey.values.map((value) => String(value)).join(",");
  }

  return "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function isJsonValue(value: unknown): value is Prisma.JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function databaseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return "资料记录已存在。";
  }

  return fallback;
}
