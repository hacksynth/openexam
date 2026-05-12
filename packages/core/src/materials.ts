import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { Prisma, QuestionKind, ReviewStatus, SourceType, Visibility, type MaterialLibraryScope } from "@prisma/client";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { extractJsonObject, materialQuestionExtractionSchema } from "./ai-output-schemas";
import type { AiTextInputPart } from "./ai";
import { readEnv } from "./env";
import { buildPagination, type PaginationInput } from "./pagination";
import { prisma } from "./prisma";
import { singleChoiceAnswerKeys, type SingleChoiceAnswerKey } from "./question-admin";
import {
  normalizeRichContentBlocks,
  richTextToPlainText,
  type RichContentBlock
} from "./rich-content";
import { readStorageBytes, writeStorageBytes } from "./storage";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type MaterialDatabase = typeof prisma;
type ExternalImageFetch = typeof fetch;
type ExternalImageLookup = (hostname: string, options: { all: true }) => Promise<Array<{ address: string; family: number }>>;
type ExternalImageDownload = {
  bytes: Buffer;
  mimeType: SupportedExternalImageMimeType;
};
type ExternalImageImportWarning = {
  reason: string;
  scope: string;
  sourceUrl: string;
};
type ExternalImageImportCacheValue =
  | {
      ok: true;
      assetId: string;
    }
  | {
      ok: false;
      reason: string;
    };
type ExternalImageImportContext = {
  bytesImported: number;
  cache: Map<string, ExternalImageImportCacheValue>;
  enabled: boolean;
  fetch: ExternalImageFetch;
  imagesImported: number;
  lookup: ExternalImageLookup;
  maxImageBytes: number;
  material: { id: string; ownerId: string } | null;
  source: NodeJS.ProcessEnv;
  writeStorageBytes: typeof writeStorageBytes;
};
type CreateMaterialQuestionCandidateOptions = {
  env?: NodeJS.ProcessEnv;
  fetch?: ExternalImageFetch;
  lookup?: ExternalImageLookup;
  writeStorageBytes?: typeof writeStorageBytes;
};

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
  libraryScope?: MaterialLibraryScope | string | null;
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
export const supportedMaterialExtensions = [".txt", ".md", ".json", ".pdf", ".docx", ".png", ".jpg", ".jpeg", ".webp"] as const;
export const supportedMaterialMimeTypes = [
  "text/plain",
  "text/markdown",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp"
] as const;
export const materialQuestionKinds = ["single_choice", "multiple_choice", "true_false", "blank", "short_answer", "case_analysis"] as const;
export const materialLibraryScopes = ["personal", "platform"] as const;
export const materialCandidatePageSizeOptions = [10, 20, 50] as const;
const externalImageAssetSource = "material_extracted_external_image";
const externalImageImportMaxCandidatesImages = 8;
const externalImageImportMaxImages = 50;
const externalImageImportMaxBytes = 100 * 1024 * 1024;
const externalImageImportTimeoutMs = 10_000;
const externalImageImportMaxRedirects = 3;
const externalImageImportUserAgent = "OpenExam Image Importer";
const supportedExternalImageMimeTypes = ["image/png", "image/jpeg", "image/webp"] as const;

type MaterialCandidatePageSize = (typeof materialCandidatePageSizeOptions)[number];
type SupportedExternalImageMimeType = (typeof supportedExternalImageMimeTypes)[number];

export type ExtractedMaterialQuestion = {
  kind?: string | null;
  stem: string;
  stemBlocks?: RichContentBlock[] | null;
  options?: Record<SingleChoiceAnswerKey, string>;
  optionBlocks?: Partial<Record<SingleChoiceAnswerKey, RichContentBlock[]>>;
  answer?: string | string[] | boolean | null;
  payload?: Prisma.JsonValue | null;
  answerKey?: Prisma.JsonValue | null;
  rubric?: Prisma.JsonValue | null;
  explanation?: string | null;
  explanationBlocks?: RichContentBlock[] | null;
  referenceAnswer?: string | null;
  referenceAnswerBlocks?: RichContentBlock[] | null;
  imageImportWarnings?: ExternalImageImportWarning[];
  difficulty?: number | null;
  knowledgeNodeId?: string | null;
  sourceRef?: string | null;
};

export type MaterialQuestionCandidateView = ReturnType<typeof toMaterialQuestionCandidateView>;

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
    return { ok: false, error: "支持 .txt、.md、.json、.pdf、.docx、.png、.jpg、.jpeg、.webp 资料。" };
  }

  const subjectId = optionalText(input.subjectId);
  const bindingScope = subjectId ? `subject:${subjectId}` : null;
  const libraryScope = parseMaterialLibraryScope(input.libraryScope);

  if (subjectId) {
    const subject = await db.subject.findUnique({ where: { id: subjectId }, select: { id: true } });

    if (!subject) {
      return { ok: false, error: "请选择有效的科目。" };
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `materials/${userId}/${randomUUID()}-${safeFileName(file.name)}`;
  const title = optionalText(input.title) || stripExtension(file.name) || "未命名资料";

  await writeStorageBytes({ storageKey, bytes });

  try {
    const result = await db.$transaction(async (tx) => {
      const material = await tx.material.create({
        data: {
          ownerId: userId,
          libraryScope,
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

export async function retryUserMaterialExtractionJob(
  userId: string,
  input: { jobId?: string | null; materialId?: string | null },
  db: MaterialDatabase = prisma
): Promise<ActionResult> {
  const materialId = optionalText(input.materialId);
  const jobId = optionalText(input.jobId);

  if (!materialId || !jobId) {
    return { ok: false, error: "请选择要重试的资料抽题任务。" };
  }

  const material = await db.material.findFirst({
    where: {
      id: materialId,
      ownerId: userId,
      libraryScope: "personal"
    },
    select: {
      id: true
    }
  });

  if (!material) {
    return { ok: false, error: "资料不存在或无权重试。" };
  }

  const job = await db.job.findFirst({
    where: {
      id: jobId,
      userId,
      type: materialJobType,
      status: "failed"
    }
  });

  if (!job || readPayloadMaterialId(job.payload) !== material.id) {
    return { ok: false, error: "只能重试当前资料的失败抽题任务。" };
  }

  await db.$transaction([
    db.material.update({
      where: {
        id: material.id
      },
      data: {
        extractionState: "queued",
        extractionError: null
      }
    }),
    db.job.update({
      where: {
        id: job.id
      },
      data: {
        status: "queued",
        error: null,
        result: Prisma.JsonNull,
        progress: 0,
        runAt: new Date(),
        startedAt: null,
        finishedAt: null
      }
    })
  ]);

  return { ok: true };
}

export async function listUserMaterials(userId: string, options: PaginationInput = {}, db: MaterialDatabase = prisma) {
  const where = { ownerId: userId, libraryScope: "personal" } satisfies Prisma.MaterialWhereInput;
  const totalItems = await db.material.count({ where });
  const pagination = buildPagination(options, totalItems);
  const materials = await db.material.findMany({
    where,
    include: {
      candidates: true
    },
    orderBy: [{ createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take
  });
  const jobs = await listMaterialJobs(materials.map((material) => material.id), db);

  return {
    pagination,
    items: materials.map((material) => toMaterialView(material, jobs.get(material.id)))
  };
}

export async function listAdminMaterials(options: PaginationInput = {}, db: MaterialDatabase = prisma) {
  const totalItems = await db.material.count();
  const pagination = buildPagination(options, totalItems);
  const materials = await db.material.findMany({
    include: {
      owner: true,
      candidates: true
    },
    orderBy: [{ createdAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take
  });
  const jobs = await listMaterialJobs(materials.map((material) => material.id), db);

  return {
    pagination,
    items: materials.map((material) => ({
      ...toMaterialView(material, jobs.get(material.id)),
      libraryScope: material.libraryScope,
      ownerEmail: material.owner.email,
      ownerName: material.owner.name
    }))
  };
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

  return candidates.map(toMaterialQuestionCandidateView);
}

export async function listMaterialQuestionCandidateSections(
  input: {
    materialId?: string | null;
    pendingPage?: string | number | null;
    confirmedPage?: string | number | null;
    pageSize?: string | number | null;
  } = {},
  db: MaterialDatabase = prisma
) {
  const materialId = optionalText(String(input.materialId ?? ""));
  const pageSize = parseMaterialCandidatePageSize(input.pageSize);
  const baseWhere: Prisma.MaterialQuestionCandidateWhereInput = materialId ? { materialId } : {};
  const pendingWhere: Prisma.MaterialQuestionCandidateWhereInput = { ...baseWhere, status: { not: "confirmed" } };
  const confirmedWhere: Prisma.MaterialQuestionCandidateWhereInput = { ...baseWhere, status: "confirmed" };
  const [pendingTotal, confirmedTotal] = await Promise.all([
    db.materialQuestionCandidate.count({ where: pendingWhere }),
    db.materialQuestionCandidate.count({ where: confirmedWhere })
  ]);
  const pendingPagination = buildCandidatePagination(input.pendingPage, pendingTotal, pageSize);
  const confirmedPagination = buildCandidatePagination(input.confirmedPage, confirmedTotal, pageSize);
  const [pendingCandidates, confirmedCandidates] = await Promise.all([
    db.materialQuestionCandidate.findMany({
      where: pendingWhere,
      include: {
        material: {
          include: {
            owner: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      skip: (pendingPagination.page - 1) * pageSize,
      take: pageSize
    }),
    db.materialQuestionCandidate.findMany({
      where: confirmedWhere,
      include: {
        material: {
          include: {
            owner: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: (confirmedPagination.page - 1) * pageSize,
      take: pageSize
    })
  ]);

  return {
    pageSize,
    totalCount: pendingTotal + confirmedTotal,
    pending: {
      items: pendingCandidates.map(toMaterialQuestionCandidateView),
      pagination: pendingPagination
    },
    confirmed: {
      items: confirmedCandidates.map(toMaterialQuestionCandidateView),
      pagination: confirmedPagination
    }
  };
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
    where: { id: candidateId.trim() },
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
      return createQuestionFromMaterialCandidate(tx, candidate);
    });

    return { ok: true, data: { questionId: question.id } };
  } catch (error) {
    return { ok: false, error: databaseErrorMessage(error, "候选题确认失败。") };
  }
}

export async function confirmMaterialQuestionCandidates(candidateIds: string[], db: MaterialDatabase = prisma): Promise<ActionResult<{ count: number; questionIds: string[] }>> {
  const ids = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];

  if (ids.length === 0) {
    return { ok: false, error: "请选择要入库的候选题。" };
  }

  const candidates = await db.materialQuestionCandidate.findMany({
    where: {
      id: {
        in: ids
      }
    },
    include: {
      material: true
    }
  });
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const orderedCandidates = ids.map((id) => candidateById.get(id));

  if (orderedCandidates.some((candidate) => !candidate)) {
    return { ok: false, error: "部分候选题不存在。" };
  }

  const validCandidates = orderedCandidates as NonNullable<(typeof orderedCandidates)[number]>[];

  if (validCandidates.some((candidate) => candidate.status === "confirmed" || candidate.confirmedQuestionId)) {
    return { ok: false, error: "已选候选题中有已确认项。" };
  }

  if (validCandidates.some((candidate) => !candidate.knowledgeNodeId)) {
    return { ok: false, error: "已选候选题中有缺少知识点的题目，暂不能确认。" };
  }

  const knowledgeNodeIds = [...new Set(validCandidates.map((candidate) => candidate.knowledgeNodeId).filter((id): id is string => Boolean(id)))];
  const knowledgeNodeCount = await db.knowledgeNode.count({
    where: {
      id: {
        in: knowledgeNodeIds
      }
    }
  });

  if (knowledgeNodeCount !== knowledgeNodeIds.length) {
    return { ok: false, error: "已选候选题中有无效知识点，暂不能确认。" };
  }

  try {
    const questionIds = await db.$transaction(async (tx) => {
      const createdIds: string[] = [];

      for (const candidate of validCandidates) {
        const created = await createQuestionFromMaterialCandidate(tx, candidate);

        createdIds.push(created.id);
      }

      return createdIds;
    });

    return { ok: true, data: { count: questionIds.length, questionIds } };
  } catch (error) {
    return { ok: false, error: databaseErrorMessage(error, "候选题批量确认失败。") };
  }
}

type ConfirmableMaterialQuestionCandidate = Prisma.MaterialQuestionCandidateGetPayload<{
  include: {
    material: true;
  };
}>;

async function createQuestionFromMaterialCandidate(
  tx: Pick<MaterialDatabase, "question" | "materialQuestionCandidate">,
  candidate: ConfirmableMaterialQuestionCandidate
) {
  const reviewStatus = candidate.material.libraryScope === "platform" ? ReviewStatus.pending_review : ReviewStatus.approved;
  const created = await tx.question.create({
    data: {
      ownerId: candidate.material.libraryScope === "platform" ? null : candidate.material.ownerId,
      kind: candidate.kind,
      stem: candidate.stem,
      payload: candidate.payload as Prisma.InputJsonValue,
      answerKey: candidate.answerKey as Prisma.InputJsonValue,
      explanation: candidate.explanation,
      difficulty: candidate.difficulty,
      sourceType: SourceType.user_uploaded,
      sourceTitle: formatMaterialSourceTitle(candidate.material.title, candidate.sourceRef),
      sourceLicense: candidate.material.sourceLicense,
      visibility: Visibility.private,
      reviewStatus,
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
          sourceType: SourceType.user_uploaded,
          visibility: Visibility.private,
          reviewStatus
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
}

export async function readMaterialText(
  materialId: string,
  db: MaterialDatabase = prisma,
  source: NodeJS.ProcessEnv = process.env
): Promise<ActionResult<{ text: string; extractionMethod: string; ocrInput?: AiTextInputPart; material: NonNullable<Awaited<ReturnType<typeof findMaterialForProcessing>>> }>> {
  const material = await findMaterialForProcessing(materialId, db);

  if (!material) {
    return { ok: false, error: "资料不存在。" };
  }

  const buffer = await readStorageBytes(material.storageKey, source).catch((error) => {
    if (isMissingStorageFileError(error)) {
      return null;
    }

    throw error;
  });

  if (!buffer) {
    return { ok: false, error: "资料文件不存在或存储卷未挂载，请重新上传资料。" };
  }

  const maxTextChars = resolveMaterialExtractionContextChars(source);

  if (material.mimeType === "text/plain" || material.mimeType === "text/markdown" || material.mimeType === "application/json") {
    const text = buffer.toString("utf8").trim();

    if (!text) {
      return { ok: false, error: "资料文本为空，无法抽题。" };
    }

    return { ok: true, data: { text: text.slice(0, maxTextChars), extractionMethod: "local_text", material } };
  }

  if (material.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();

    if (!text) {
      return { ok: false, error: "DOCX 未抽取到有效文本。" };
    }

    return { ok: true, data: { text: text.slice(0, maxTextChars), extractionMethod: "local_docx", material } };
  }

  if (material.mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text.trim();

    if (text) {
      return { ok: true, data: { text: text.slice(0, maxTextChars), extractionMethod: "local_pdf", material } };
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

export async function createMaterialQuestionCandidates(
  materialId: string,
  jobId: string,
  questions: ExtractedMaterialQuestion[],
  db: MaterialDatabase = prisma,
  options: CreateMaterialQuestionCandidateOptions = {}
) {
  const normalizedQuestions = await importExternalImagesForQuestions(materialId, questions, db, options);

  await db.materialQuestionCandidate.deleteMany({
    where: {
      materialId,
      status: "pending"
    }
  });

  await db.materialQuestionCandidate.createMany({
    data: normalizedQuestions.map((question) => {
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

async function importExternalImagesForQuestions(
  materialId: string,
  questions: ExtractedMaterialQuestion[],
  db: MaterialDatabase,
  options: CreateMaterialQuestionCandidateOptions
) {
  if (!questions.some(hasExternalImageBlocks)) {
    return questions;
  }

  const source = options.env ?? process.env;
  const env = readEnv({ ...source, DATABASE_URL: source.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public" });
  const material = env.OPENEXAM_IMPORT_EXTERNAL_IMAGES
    ? await db.material.findUnique({
        where: { id: materialId },
        select: {
          id: true,
          ownerId: true
        }
      })
    : null;
  const context: ExternalImageImportContext = {
    bytesImported: 0,
    cache: new Map(),
    enabled: env.OPENEXAM_IMPORT_EXTERNAL_IMAGES,
    fetch: options.fetch ?? fetch,
    imagesImported: 0,
    lookup: options.lookup ?? lookup,
    maxImageBytes: env.OPENEXAM_UPLOAD_MAX_BYTES,
    material,
    source,
    writeStorageBytes: options.writeStorageBytes ?? writeStorageBytes
  };

  return Promise.all(questions.map((question) => importExternalImagesForQuestion(question, db, context)));
}

function hasExternalImageBlocks(question: ExtractedMaterialQuestion) {
  return [
    ...(question.stemBlocks ?? []),
    ...Object.values(question.optionBlocks ?? {}).flatMap((blocks) => blocks ?? []),
    ...(question.explanationBlocks ?? []),
    ...(question.referenceAnswerBlocks ?? [])
  ].some((block) => block.type === "image" && !block.assetId && Boolean(block.sourceUrl));
}

async function importExternalImagesForQuestion(question: ExtractedMaterialQuestion, db: MaterialDatabase, context: ExternalImageImportContext) {
  const warnings: ExternalImageImportWarning[] = [];
  let questionImageCount = 0;
  const imported: ExtractedMaterialQuestion = { ...question };

  imported.stemBlocks = await importExternalImagesInBlocks(question.stemBlocks, "stemBlocks", warnings, context, db, () => {
    questionImageCount += 1;
    return questionImageCount;
  });

  if (question.optionBlocks) {
    const optionBlocks: Partial<Record<SingleChoiceAnswerKey, RichContentBlock[]>> = {};

    for (const key of singleChoiceAnswerKeys) {
      const blocks = question.optionBlocks[key];

      if (blocks) {
        optionBlocks[key] = (await importExternalImagesInBlocks(blocks, `options.${key}.blocks`, warnings, context, db, () => {
          questionImageCount += 1;
          return questionImageCount;
        })) ?? blocks;
      }
    }

    imported.optionBlocks = Object.keys(optionBlocks).length > 0 ? optionBlocks : question.optionBlocks;
  }

  imported.explanationBlocks = await importExternalImagesInBlocks(question.explanationBlocks, "explanationBlocks", warnings, context, db, () => {
    questionImageCount += 1;
    return questionImageCount;
  });
  imported.referenceAnswerBlocks = await importExternalImagesInBlocks(question.referenceAnswerBlocks, "referenceAnswerBlocks", warnings, context, db, () => {
    questionImageCount += 1;
    return questionImageCount;
  });

  if (warnings.length > 0) {
    imported.imageImportWarnings = warnings;
  }

  return imported;
}

async function importExternalImagesInBlocks(
  blocks: RichContentBlock[] | null | undefined,
  scope: string,
  warnings: ExternalImageImportWarning[],
  context: ExternalImageImportContext,
  db: MaterialDatabase,
  nextQuestionImageCount: () => number
) {
  if (!blocks?.length) {
    return blocks;
  }

  const importedBlocks: RichContentBlock[] = [];

  for (const block of blocks) {
    if (block.type !== "image" || block.assetId || !block.sourceUrl) {
      importedBlocks.push(block);
      continue;
    }

    const sourceUrl = block.sourceUrl;
    const questionImageCount = nextQuestionImageCount();

    if (questionImageCount > externalImageImportMaxCandidatesImages) {
      warnings.push({
        sourceUrl,
        scope,
        reason: `单个候选题图片不能超过 ${externalImageImportMaxCandidatesImages} 张，已保留外链。`
      });
      importedBlocks.push(block);
      continue;
    }

    const result = await importExternalImage(sourceUrl, context, db);

    if (result.ok) {
      importedBlocks.push({ ...block, assetId: result.assetId });
      continue;
    }

    warnings.push({
      sourceUrl,
      scope,
      reason: result.reason
    });
    importedBlocks.push(block);
  }

  return importedBlocks;
}

async function importExternalImage(sourceUrl: string, context: ExternalImageImportContext, db: MaterialDatabase): Promise<ExternalImageImportCacheValue> {
  const normalized = normalizeExternalImageUrl(sourceUrl);

  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason };
  }

  const cached = context.cache.get(normalized.url);

  if (cached) {
    return cached;
  }

  if (!context.enabled) {
    const disabled = { ok: false, reason: "外链图片自动导入已关闭。" } as const;
    context.cache.set(normalized.url, disabled);
    return disabled;
  }

  if (!context.material) {
    const missingMaterial = { ok: false, reason: "资料不存在，无法导入外链图片。" } as const;
    context.cache.set(normalized.url, missingMaterial);
    return missingMaterial;
  }

  if (context.imagesImported >= externalImageImportMaxImages) {
    const tooMany = { ok: false, reason: `单个资料任务最多导入 ${externalImageImportMaxImages} 张外链图片，已保留外链。` } as const;
    context.cache.set(normalized.url, tooMany);
    return tooMany;
  }

  if (context.bytesImported >= externalImageImportMaxBytes) {
    const tooLarge = { ok: false, reason: `单个资料任务外链图片总大小超过 ${formatBytes(externalImageImportMaxBytes)}，已保留外链。` } as const;
    context.cache.set(normalized.url, tooLarge);
    return tooLarge;
  }

  const downloaded = await downloadExternalImage(normalized.url, context.fetch, context.lookup, context.maxImageBytes);

  if (!downloaded.ok) {
    const failed = { ok: false, reason: downloaded.error } as const;
    context.cache.set(normalized.url, failed);
    return failed;
  }

  if (context.bytesImported + downloaded.data.bytes.length > externalImageImportMaxBytes) {
    const tooLarge = { ok: false, reason: `单个资料任务外链图片总大小超过 ${formatBytes(externalImageImportMaxBytes)}，已保留外链。` } as const;
    context.cache.set(normalized.url, tooLarge);
    return tooLarge;
  }

  const extension = externalImageExtension(downloaded.data.mimeType);
  const sha256 = createHash("sha256").update(downloaded.data.bytes).digest("hex");
  const storageKey = `materials/${context.material.ownerId}/extracted-images/${randomUUID()}.${extension}`;

  let asset: { id: string };

  try {
    await context.writeStorageBytes({
      storageKey,
      bytes: downloaded.data.bytes,
      source: context.source
    });

    asset = await db.asset.create({
      data: {
        ownerId: context.material.ownerId,
        materialId: context.material.id,
        visibility: Visibility.private,
        mimeType: downloaded.data.mimeType,
        sizeBytes: downloaded.data.bytes.length,
        sha256,
        storageKey,
        source: externalImageAssetSource
      },
      select: {
        id: true
      }
    });
  } catch {
    const failed = { ok: false, reason: "外链图片保存失败，已保留外链。" } as const;
    context.cache.set(normalized.url, failed);
    return failed;
  }

  const imported = { ok: true, assetId: asset.id } as const;

  context.imagesImported += 1;
  context.bytesImported += downloaded.data.bytes.length;
  context.cache.set(normalized.url, imported);

  return imported;
}

async function downloadExternalImage(
  sourceUrl: string,
  fetchImage: ExternalImageFetch,
  lookupHostname: ExternalImageLookup,
  maxBytes: number,
  redirects = 0
): Promise<ActionResult<ExternalImageDownload>> {
  const urlCheck = await assertSafeExternalImageUrl(sourceUrl, lookupHostname);

  if (!urlCheck.ok) {
    return { ok: false, error: urlCheck.error };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), externalImageImportTimeoutMs);

  try {
    const response = await fetchImage(sourceUrl, {
      headers: {
        accept: "image/png,image/jpeg,image/webp,*/*;q=0.1",
        "user-agent": externalImageImportUserAgent
      },
      redirect: "manual",
      signal: controller.signal
    });

    if (isRedirectStatus(response.status)) {
      if (redirects >= externalImageImportMaxRedirects) {
        return { ok: false, error: "外链图片重定向次数过多，已保留外链。" };
      }

      const location = response.headers.get("location");

      if (!location) {
        return { ok: false, error: "外链图片重定向缺少 Location，已保留外链。" };
      }

      return downloadExternalImage(new URL(location, sourceUrl).toString(), fetchImage, lookupHostname, maxBytes, redirects + 1);
    }

    if (!response.ok) {
      return { ok: false, error: `外链图片下载失败 (${response.status})，已保留外链。` };
    }

    const mimeType = normalizeExternalImageMimeType(response.headers.get("content-type"));

    if (!mimeType) {
      return { ok: false, error: "外链图片格式暂不支持，请使用 PNG、JPEG 或 WebP。" };
    }

    const contentLength = parseContentLength(response.headers.get("content-length"));

    if (contentLength !== null && contentLength > maxBytes) {
      return { ok: false, error: `外链图片超过 ${formatBytes(maxBytes)}，已保留外链。` };
    }

    const bytes = await readResponseBytes(response, maxBytes);

    if (!bytes.ok) {
      return bytes;
    }

    if (!matchesExternalImageMagic(bytes.data, mimeType)) {
      return { ok: false, error: "外链图片内容与声明格式不匹配，已保留外链。" };
    }

    return { ok: true, data: { bytes: bytes.data, mimeType } };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "AbortError" ? "外链图片下载超时，已保留外链。" : "外链图片下载失败，已保留外链。" };
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<ActionResult<Buffer>> {
  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length > maxBytes) {
      return { ok: false, error: `外链图片超过 ${formatBytes(maxBytes)}，已保留外链。` };
    }

    return { ok: true, data: bytes };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel();
      return { ok: false, error: `外链图片超过 ${formatBytes(maxBytes)}，已保留外链。` };
    }

    chunks.push(value);
  }

  return { ok: true, data: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes) };
}

async function assertSafeExternalImageUrl(sourceUrl: string, lookupHostname: ExternalImageLookup): Promise<ActionResult> {
  const normalized = normalizeExternalImageUrl(sourceUrl);

  if (!normalized.ok) {
    return { ok: false, error: normalized.reason };
  }

  const hostname = new URL(normalized.url).hostname;

  if (isUnsafeHostname(hostname)) {
    return { ok: false, error: "外链图片地址指向本机或内网，已保留外链。" };
  }

  const addresses = await lookupHostname(hostname, { all: true }).catch(() => []);

  if (addresses.length === 0) {
    return { ok: false, error: "外链图片域名解析失败，已保留外链。" };
  }

  if (addresses.some((address) => isPrivateIpAddress(address.address))) {
    return { ok: false, error: "外链图片地址指向本机或内网，已保留外链。" };
  }

  return { ok: true };
}

function normalizeExternalImageUrl(sourceUrl: string): { ok: true; url: string } | { ok: false; reason: string } {
  try {
    const url = new URL(sourceUrl.trim());

    if (url.protocol !== "https:") {
      return { ok: false, reason: "仅支持 HTTPS 外链图片，已保留外链。" };
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    if (url.port === "443") {
      url.port = "";
    }

    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, reason: "外链图片 URL 无效，已保留外链。" };
  }
}

function isUnsafeHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function isPrivateIpAddress(value: string) {
  if (!isIP(value)) {
    return false;
  }

  if (value === "::1" || value === "0:0:0:0:0:0:0:1") {
    return true;
  }

  if (value.includes(":")) {
    const normalized = value.toLowerCase();

    return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized === "::";
  }

  const parts = value.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

function normalizeExternalImageMimeType(value: string | null): SupportedExternalImageMimeType | null {
  const mimeType = value?.split(";")[0]?.trim().toLowerCase() ?? "";

  return supportedExternalImageMimeTypes.includes(mimeType as SupportedExternalImageMimeType) ? (mimeType as SupportedExternalImageMimeType) : null;
}

function parseContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function matchesExternalImageMagic(bytes: Buffer, mimeType: SupportedExternalImageMimeType) {
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function externalImageExtension(mimeType: SupportedExternalImageMimeType) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "png";
}


export function validateExtractedQuestionsJson(value: string): ActionResult<{ questions: ExtractedMaterialQuestion[] }> {
  const json = extractJsonObject(value);

  if (!json) {
    return { ok: false, error: "AI 抽题结果不是有效 JSON：未找到 JSON 对象。" };
  }

  try {
    const raw = JSON.parse(json);
    const parsed = materialQuestionExtractionSchema.safeParse(raw);

    if (!parsed.success) {
      return { ok: false, error: formatExtractionSchemaError(raw, parsed.error.issues[0]?.path.join(".") || "root") };
    }

    const questions: ExtractedMaterialQuestion[] = [];

    for (const [index, item] of parsed.data.questions.entries()) {
      const question = parseExtractedQuestion(item, index);

      if (!question.ok) {
        return question;
      }

      questions.push(question.data);
    }

    return {
      ok: true,
      data: {
        questions
      }
    };
  } catch (error) {
    return { ok: false, error: `AI 抽题结果不是有效 JSON：${error instanceof Error ? error.message : "JSON.parse 失败"}。` };
  }
}

function formatExtractionSchemaError(value: unknown, path: string) {
  if (!isPlainObject(value)) {
    return "AI 抽题结果格式无效：根节点必须是对象，形如 {\"questions\":[...]}。";
  }

  if (!Array.isArray(value.questions)) {
    return "AI 抽题结果格式无效：缺少 questions 数组。";
  }

  if (value.questions.length === 0) {
    return "AI 抽题结果格式无效：questions 至少需要 1 道题。";
  }

  return `AI 抽题结果格式无效：字段 ${path} 不符合要求。`;
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
      "你是 OpenExam 的资料抽题助手。只根据给定资料抽取题目候选。必须输出严格 JSON，不要输出 Markdown。不要删除题干、选项、解析或参考答案中的图片链接。",
    input: [
      "请从资料中尽可能完整抽取所有可识别的候选题，不要人为限制题量。题型可为 single_choice、multiple_choice、true_false、blank、short_answer、case_analysis。",
      "如果题干、选项、解析或参考答案中有图片，必须在对应 blocks 中保留为 image block。图片 block 形如 {\"type\":\"image\",\"sourceUrl\":\"https://...png\",\"alt\":\"图片说明\"}；文字 block 形如 {\"type\":\"text\",\"text\":\"文字\"}。",
      "answerKey/answer 只放机器可判分答案，不要放图片；答案图片放入 referenceAnswerBlocks 或 explanationBlocks。",
      "输出 JSON：",
      '{"questions":[{"kind":"single_choice","stem":"题干纯文本","stemBlocks":[{"type":"text","text":"题干"},{"type":"image","sourceUrl":"https://example.com/question.png","alt":"题图"}],"options":{"A":"选项A纯文本","B":"选项B纯文本","C":"选项C纯文本","D":"选项D纯文本"},"richOptions":[{"key":"A","text":"选项A纯文本","blocks":[{"type":"text","text":"选项A"},{"type":"image","sourceUrl":"https://example.com/option-a.png","alt":"选项图"}]}],"answer":"A","explanation":"解析纯文本","explanationBlocks":[{"type":"text","text":"解析"}],"referenceAnswerBlocks":[{"type":"text","text":"参考答案"}],"difficulty":2,"knowledgeNodeId":"知识点ID","sourceRef":"页码或段落"}]}',
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

function parseExtractedQuestion(value: unknown, index = 0): ActionResult<ExtractedMaterialQuestion> {
  const label = `第 ${index + 1} 题`;

  if (!isPlainObject(value)) {
    return { ok: false, error: `AI 抽题结果格式无效：${label} 必须是对象。` };
  }

  const rawStem = textValue(value.stem);
  const stemBlocks = readOptionalRichContentBlocks(value.stemBlocks, rawStem);
  const stem = stemBlocks ? richTextToPlainText(stemBlocks) || rawStem : rawStem;
  const kind = parseMaterialQuestionKind(textValue(value.kind)) ?? QuestionKind.single_choice;
  const difficulty = parseDifficultyValue(value.difficulty);
  const choiceContent = parseChoiceContent(value);
  const answer = parseAnswerValue(value.answer);
  const payload = isJsonValue(value.payload) ? value.payload : null;
  const answerKey = isJsonValue(value.answerKey) ? value.answerKey : null;
  const rubric = isJsonValue(value.rubric) ? value.rubric : null;
  const explanation = optionalText(textValue(value.explanation));
  const explanationBlocks = readOptionalRichContentBlocks(value.explanationBlocks, explanation);
  const referenceAnswer = optionalText(textValue(value.referenceAnswer));
  const referenceAnswerBlocks = readOptionalRichContentBlocks(value.referenceAnswerBlocks, referenceAnswer);

  if (!stem) {
    return { ok: false, error: `AI 抽题结果格式无效：${label} 缺少 stem 题干。` };
  }

  if (kind === QuestionKind.single_choice) {
    if (!choiceContent) {
      return { ok: false, error: `AI 抽题结果格式无效：${label} 单选题必须包含 A/B/C/D 四个非空选项。` };
    }

    if (!singleChoiceAnswerKeys.includes(String(answer).toUpperCase() as SingleChoiceAnswerKey)) {
      return { ok: false, error: `AI 抽题结果格式无效：${label} 单选题 answer 必须是 A/B/C/D。` };
    }

    return {
      ok: true,
      data: {
        stem,
        ...(stemBlocks ? { stemBlocks } : {}),
        options: choiceContent.options,
        ...(choiceContent.optionBlocks ? { optionBlocks: choiceContent.optionBlocks } : {}),
        answer: String(answer).toUpperCase(),
        explanation,
        ...(explanationBlocks ? { explanationBlocks } : {}),
        ...(referenceAnswer ? { referenceAnswer } : {}),
        ...(referenceAnswerBlocks ? { referenceAnswerBlocks } : {}),
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
      ...(stemBlocks ? { stemBlocks } : {}),
      ...(choiceContent ? { options: choiceContent.options } : {}),
      ...(choiceContent?.optionBlocks ? { optionBlocks: choiceContent.optionBlocks } : {}),
      answer,
      payload,
      answerKey,
      rubric,
      explanation,
      ...(explanationBlocks ? { explanationBlocks } : {}),
      ...(referenceAnswer ? { referenceAnswer } : {}),
      ...(referenceAnswerBlocks ? { referenceAnswerBlocks } : {}),
      difficulty,
      knowledgeNodeId: optionalText(textValue(value.knowledgeNodeId)),
      sourceRef: optionalText(textValue(value.sourceRef))
    }
  };
}

function isMissingStorageFileError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  if ("code" in error && (error as { code?: unknown }).code === "ENOENT") {
    return true;
  }

  return error.name === "NoSuchKey" || error.name === "NotFound";
}

function resolveMaterialExtractionContextChars(source: NodeJS.ProcessEnv) {
  const env = readEnv({
    ...source,
    DATABASE_URL: source.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public"
  });

  return env.OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS;
}

function parseCandidateUpdateInput(input: MaterialQuestionCandidateUpdateInput): ActionResult<Prisma.MaterialQuestionCandidateUpdateInput> {
  const kind = parseMaterialQuestionKind(input.kind ?? "") ?? QuestionKind.single_choice;
  const stem = input.stem.trim();
  const difficulty = parseDifficultyValue(input.difficulty);
  const explanation = optionalText(input.explanation);
  const knowledgeNodeId = optionalText(input.knowledgeNodeId);
  const sourceRef = optionalText(input.sourceRef);
  const payload = parseOptionalJson(input.payloadJson, "payload JSON");
  const answerKey = parseOptionalJson(input.answerKeyJson, "answerKey JSON");

  if (!stem) {
    return { ok: false, error: "题干不能为空。" };
  }

  if (!payload.ok) {
    return payload;
  }

  if (!answerKey.ok) {
    return answerKey;
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
        payload: mergeChoicePayloadOverride(
          {
            options: singleChoiceAnswerKeys.map((key) => ({
              key,
              text: options[key]
            }))
          },
          payload.data
        ),
        answerKey: kind === QuestionKind.multiple_choice ? { values: answerValues } : { value: answer.toUpperCase() },
        explanation,
        difficulty,
        knowledgeNodeId,
        sourceRef
      }
    };
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
      payload: buildChoicePayload(question),
      answerKey: {
        value: String(question.answer ?? "").toUpperCase()
      }
    };
  }

  if (kind === QuestionKind.multiple_choice && question.options) {
    return {
      kind,
      stem: question.stem,
      payload: buildChoicePayload(question),
      answerKey: normalizeAnswerKey(question.answerKey, question.answer)
    };
  }

  return {
    kind,
    stem: question.stem,
    payload: buildRichPayload(question, toInputJsonValue(question.payload) ?? defaultPayloadForKind(kind)),
    answerKey: normalizeAnswerKey(question.answerKey, question.answer)
  };
}

function parseMaterialQuestionKind(value: string) {
  return materialQuestionKinds.includes(value as (typeof materialQuestionKinds)[number]) ? (value as QuestionKind) : null;
}

function parseChoiceContent(value: Record<string, unknown>) {
  const optionTexts = parsePartialOptions(value.options);
  const richOptions = parseRichOptions(value.richOptions);
  const explicitOptionBlocks = parseOptionBlocks(value.optionBlocks);
  const options: Partial<Record<SingleChoiceAnswerKey, string>> = {};
  const optionBlocks: Partial<Record<SingleChoiceAnswerKey, RichContentBlock[]>> = {};

  for (const key of singleChoiceAnswerKeys) {
    const text = optionTexts[key] || richOptions.texts[key] || "";
    const blocks = richOptions.blocks[key] ?? explicitOptionBlocks[key] ?? readOptionalRichContentBlocks(optionTexts.raw[key], text);
    const plain = text || (blocks ? richTextToPlainText(blocks) : "");

    if (plain) {
      options[key] = plain;
    }

    if (blocks) {
      optionBlocks[key] = blocks;
    }
  }

  if (!singleChoiceAnswerKeys.every((key) => options[key])) {
    return null;
  }

  return {
    options: options as Record<SingleChoiceAnswerKey, string>,
    optionBlocks: Object.keys(optionBlocks).length > 0 ? optionBlocks : null
  };
}

function parsePartialOptions(value: unknown) {
  const options: Partial<Record<SingleChoiceAnswerKey, string>> = {};
  const raw: Partial<Record<SingleChoiceAnswerKey, unknown>> = {};

  if (!isPlainObject(value)) {
    return { ...options, raw };
  }

  for (const key of singleChoiceAnswerKeys) {
    const rawValue = value[key] ?? value[key.toLowerCase()];
    const text = choiceOptionTextValue(rawValue);

    if (rawValue !== undefined) {
      raw[key] = rawValue;
    }

    if (text) {
      options[key] = text;
    }
  }

  return { ...options, raw };
}

function choiceOptionTextValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return textValue(value);
  }

  if (Array.isArray(value)) {
    return richTextToPlainText(normalizeRichContentBlocks(value)) || null;
  }

  if (isPlainObject(value)) {
    const text = textValue(value.text);

    if (text) {
      return text;
    }

    return richTextToPlainText(normalizeRichContentBlocks(readRichContentValue(value))) || null;
  }

  return null;
}

function parseRichOptions(value: unknown) {
  const texts: Partial<Record<SingleChoiceAnswerKey, string>> = {};
  const blocks: Partial<Record<SingleChoiceAnswerKey, RichContentBlock[]>> = {};

  if (!Array.isArray(value)) {
    return { texts, blocks };
  }

  for (const item of value) {
    if (!isPlainObject(item) || typeof item.key !== "string") {
      continue;
    }

    const key = item.key.trim().toUpperCase() as SingleChoiceAnswerKey;

    if (!singleChoiceAnswerKeys.includes(key)) {
      continue;
    }

    const text = optionalText(textValue(item.text));
    const richBlocks = readOptionalRichContentBlocks(item.blocks, text);

    if (text) {
      texts[key] = text;
    } else if (richBlocks) {
      texts[key] = richTextToPlainText(richBlocks);
    }

    if (richBlocks) {
      blocks[key] = richBlocks;
    }
  }

  return { texts, blocks };
}

function parseOptionBlocks(value: unknown) {
  const blocks: Partial<Record<SingleChoiceAnswerKey, RichContentBlock[]>> = {};

  if (!isPlainObject(value)) {
    return blocks;
  }

  for (const key of singleChoiceAnswerKeys) {
    const richBlocks = readOptionalRichContentBlocks(value[key] ?? value[key.toLowerCase()]);

    if (richBlocks) {
      blocks[key] = richBlocks;
    }
  }

  return blocks;
}

function buildChoicePayload(question: ExtractedMaterialQuestion): Prisma.InputJsonValue {
  const payload = {
    options: singleChoiceAnswerKeys.map((key) => {
      const option: { key: SingleChoiceAnswerKey; text: string; blocks?: RichContentBlock[] } = {
        key,
        text: question.options?.[key] ?? ""
      };
      const blocks = question.optionBlocks?.[key] ?? readOptionalRichContentBlocks(null, option.text);

      if (blocks) {
        option.blocks = blocks;
      }

      return option;
    })
  };

  return buildRichPayload(question, payload);
}

function buildRichPayload(question: ExtractedMaterialQuestion, basePayload: unknown): Prisma.InputJsonValue {
  const payload = isPlainObject(basePayload) ? { ...basePayload } : {};

  if (question.stemBlocks?.length) {
    payload.stemBlocks = question.stemBlocks;
  }

  if (question.explanationBlocks?.length) {
    payload.explanationBlocks = question.explanationBlocks;
  }

  if (question.referenceAnswer) {
    payload.referenceAnswer = question.referenceAnswer;
  }

  if (question.referenceAnswerBlocks?.length) {
    payload.referenceAnswerBlocks = question.referenceAnswerBlocks;
  }

  if (question.imageImportWarnings?.length) {
    payload.imageImportWarnings = question.imageImportWarnings;
  }

  return toInputJsonValue(payload) ?? {};
}

function readOptionalRichContentBlocks(value: unknown, fallbackText?: string | null): RichContentBlock[] | null {
  const blocks = normalizeRichContentBlocks(readRichContentValue(value), fallbackText);

  if (blocks.length === 0) {
    return null;
  }

  if (Array.isArray(value) || blocks.some((block) => block.type === "image")) {
    return blocks;
  }

  return null;
}

function readRichContentValue(value: unknown) {
  if (isPlainObject(value) && Array.isArray(value.blocks)) {
    return value.blocks;
  }

  if (isPlainObject(value) && typeof value.type === "string") {
    return [value];
  }

  return value;
}

function mergeChoicePayloadOverride(defaultPayload: { options: { key: SingleChoiceAnswerKey; text: string }[] }, override: Prisma.InputJsonValue | null) {
  if (!isPlainObject(override)) {
    return defaultPayload;
  }

  const overrideObject = override as Record<string, unknown>;
  const mergedOptions = defaultPayload.options.map((option) => {
    const overrideOption = Array.isArray(overrideObject.options)
      ? overrideObject.options.find((item: unknown) => isPlainObject(item) && item.key === option.key)
      : null;
    const blocks = isPlainObject(overrideOption) ? readOptionalRichContentBlocks(overrideOption.blocks, option.text) : null;

    return blocks ? { ...option, blocks } : option;
  });
  const merged: Record<string, unknown> = { ...overrideObject, options: mergedOptions };

  return toInputJsonValue(merged) ?? defaultPayload;
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

function toInputJsonValue(value: unknown): Prisma.InputJsonValue | null {
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
    confirmedCandidateCount: material.candidates.filter((candidate) => candidate.status === "confirmed" && candidate.confirmedQuestionId).length,
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

function toMaterialQuestionCandidateView(
  candidate: Prisma.MaterialQuestionCandidateGetPayload<{
    include: {
      material: {
        include: {
          owner: true;
        };
      };
    };
  }>
) {
  return {
    id: candidate.id,
    materialId: candidate.materialId,
    materialTitle: candidate.material.title,
    materialScope: candidate.material.libraryScope,
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
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  };
}

function parseMaterialCandidatePageSize(value: string | number | null | undefined): MaterialCandidatePageSize {
  const pageSize = Number(value);

  return materialCandidatePageSizeOptions.includes(pageSize as MaterialCandidatePageSize) ? (pageSize as MaterialCandidatePageSize) : 20;
}

function buildCandidatePagination(value: string | number | null | undefined, totalItems: number, pageSize: MaterialCandidatePageSize) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedPage = parsePositiveInteger(value) ?? 1;
  const page = Math.min(requestedPage, totalPages);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    previousPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null
  };
}

function parsePositiveInteger(value: string | number | null | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

  if (ext === ".json") {
    return "application/json";
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

function parseMaterialLibraryScope(value: MaterialLibraryScope | string | null | undefined): MaterialLibraryScope {
  return value === "platform" ? "platform" : "personal";
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
