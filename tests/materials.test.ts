import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMaterialQuestionCandidates, readMaterialText, validateExtractedQuestionsJson } from "@openexam/core/materials";

describe("material question extraction", () => {
  it("accepts valid single-choice extraction JSON", () => {
    expect(
      validateExtractedQuestionsJson(
        JSON.stringify({
          questions: [
            {
              stem: "事务原子性最准确的含义是什么？",
              options: {
                A: "全部成功或全部失败",
                B: "并发事务互不影响",
                C: "提交后永久保存",
                D: "数据满足约束"
              },
              answer: "A",
              explanation: "原子性要求事务作为不可分割的工作单元。",
              difficulty: 2,
              knowledgeNodeId: "node_1",
              sourceRef: "第 1 段"
            }
          ]
        })
      )
    ).toEqual({
      ok: true,
      data: {
        questions: [
          {
            stem: "事务原子性最准确的含义是什么？",
            options: {
              A: "全部成功或全部失败",
              B: "并发事务互不影响",
              C: "提交后永久保存",
              D: "数据满足约束"
            },
            answer: "A",
            explanation: "原子性要求事务作为不可分割的工作单元。",
            difficulty: 2,
            knowledgeNodeId: "node_1",
            sourceRef: "第 1 段"
          }
        ]
      }
    });
  });

  it("rejects invalid extraction JSON", () => {
    expect(validateExtractedQuestionsJson("{not json")).toEqual({
      ok: false,
      error: "AI 抽题结果不是有效 JSON。"
    });
    expect(validateExtractedQuestionsJson(JSON.stringify({ questions: [] }))).toEqual({
      ok: false,
      error: "AI 抽题结果格式无效。"
    });
  });

  it("replaces pending candidates before writing extracted questions", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      materialQuestionCandidate: {
        deleteMany: async (args: unknown) => {
          calls.push({ method: "deleteMany", args });
          return { count: 1 };
        },
        createMany: async (args: unknown) => {
          calls.push({ method: "createMany", args });
          return { count: 1 };
        }
      }
    };

    await createMaterialQuestionCandidates(
      "material_1",
      "job_1",
      [
        {
          stem: "事务原子性最准确的含义是什么？",
          options: {
            A: "全部成功或全部失败",
            B: "并发事务互不影响",
            C: "提交后永久保存",
            D: "数据满足约束"
          },
          answer: "A",
          explanation: "原子性要求事务作为不可分割的工作单元。",
          difficulty: 2,
          knowledgeNodeId: "node_1",
          sourceRef: "第 1 段"
        }
      ],
      db as never
    );
    expect(calls[0]).toEqual({
      method: "deleteMany",
      args: {
        where: {
          materialId: "material_1",
          status: "pending"
        }
      }
    });
    expect(calls[1]).toMatchObject({
      method: "createMany",
      args: {
        data: [
          expect.objectContaining({
            materialId: "material_1",
            jobId: "job_1",
            stem: "事务原子性最准确的含义是什么？"
          })
        ]
      }
    });
  });

  it("uses AI OCR input for image materials", async () => {
    const originalStorageDir = process.env.LOCAL_STORAGE_DIR;
    const storageRoot = path.join(tmpdir(), `openexam-materials-${Date.now()}`);
    const storageKey = "materials/user_1/image.png";
    const filePath = path.join(storageRoot, storageKey);

    process.env.LOCAL_STORAGE_DIR = storageRoot;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from("fake-image"));

    const db = {
      material: {
        findUnique: async () => ({
          id: "material_1",
          ownerId: "user_1",
          title: "扫描资料",
          mimeType: "image/png",
          sizeBytes: 10,
          sha256: "hash",
          storageKey,
          bindingScope: null,
          extractionState: "queued",
          extractionMethod: null,
          extractionError: null,
          sourceLicense: null,
          createdAt: new Date("2026-05-05T00:00:00.000Z"),
          updatedAt: new Date("2026-05-05T00:00:00.000Z")
        })
      }
    };

    try {
      const result = await readMaterialText("material_1", db as never);

      expect(result.ok).toBe(true);
      expect(result.ok ? result.data.extractionMethod : "").toBe("ai_ocr");
      expect(result.ok ? result.data.ocrInput : null).toMatchObject({
        type: "image",
        mimeType: "image/png",
        filename: "扫描资料"
      });
      const ocrInput = result.ok ? result.data.ocrInput : null;

      expect(ocrInput && ocrInput.type !== "text" ? ocrInput.dataBase64 : "").toBe(Buffer.from("fake-image").toString("base64"));
    } finally {
      if (originalStorageDir === undefined) {
        delete process.env.LOCAL_STORAGE_DIR;
      } else {
        process.env.LOCAL_STORAGE_DIR = originalStorageDir;
      }
    }
  });
});
