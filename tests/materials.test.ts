import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMaterialExtractionPrompt,
  confirmMaterialQuestionCandidate,
  createMaterialQuestionCandidates,
  listMaterialQuestionCandidateSections,
  readMaterialText,
  validateExtractedQuestionsJson
} from "@openexam/core/materials";

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

  it("accepts extraction JSON wrapped in provider prose or markdown fences", () => {
    const output = [
      "以下是 JSON：",
      "```json",
      JSON.stringify({
        questions: [
          {
            stem: "黑盒测试的主要依据是（）。",
            options: {
              A: "程序代码",
              B: "需求规格说明",
              C: "开发语言",
              D: "数据库结构"
            },
            answer: "B",
            difficulty: 1
          }
        ]
      }),
      "```"
    ].join("\n");

    expect(validateExtractedQuestionsJson(output)).toEqual({
      ok: true,
      data: {
        questions: [
          {
            stem: "黑盒测试的主要依据是（）。",
            options: {
              A: "程序代码",
              B: "需求规格说明",
              C: "开发语言",
              D: "数据库结构"
            },
            answer: "B",
            explanation: null,
            difficulty: 1,
            knowledgeNodeId: null,
            sourceRef: null
          }
        ]
      }
    });
  });

  it("preserves question, option, explanation, and answer image links as rich blocks", () => {
    expect(
      validateExtractedQuestionsJson(
        JSON.stringify({
          questions: [
            {
              stem: "观察![题图](https://example.com/question.png)后选择正确选项",
              options: {
                A: "纯文本选项",
                B: "带图 https://example.com/option-b.webp",
                C: "干扰项 C",
                D: "干扰项 D"
              },
              answer: "B",
              explanation: "解析见 https://example.com/explanation.jpg",
              referenceAnswerBlocks: [{ type: "image", sourceUrl: "https://example.com/answer.png", alt: "答案图" }]
            }
          ]
        })
      )
    ).toEqual({
      ok: true,
      data: {
        questions: [
          {
            stem: "观察题图后选择正确选项",
            stemBlocks: [
              { type: "text", text: "观察" },
              { type: "image", sourceUrl: "https://example.com/question.png", assetId: null, alt: "题图" },
              { type: "text", text: "后选择正确选项" }
            ],
            options: {
              A: "纯文本选项",
              B: "带图 https://example.com/option-b.webp",
              C: "干扰项 C",
              D: "干扰项 D"
            },
            optionBlocks: {
              B: [
                { type: "text", text: "带图 " },
                { type: "image", sourceUrl: "https://example.com/option-b.webp", assetId: null, alt: "图片" }
              ]
            },
            answer: "B",
            explanation: "解析见 https://example.com/explanation.jpg",
            explanationBlocks: [
              { type: "text", text: "解析见 " },
              { type: "image", sourceUrl: "https://example.com/explanation.jpg", assetId: null, alt: "图片" }
            ],
            referenceAnswerBlocks: [{ type: "image", sourceUrl: "https://example.com/answer.png", assetId: null, alt: "答案图" }],
            difficulty: null,
            knowledgeNodeId: null,
            sourceRef: null
          }
        ]
      }
    });
  });

  it("asks for all recognizable questions without a prompt-level count cap", () => {
    const prompt = buildMaterialExtractionPrompt({
      title: "资料",
      text: "题目正文",
      knowledgeNodes: []
    });

    expect(prompt.input).toContain("尽可能完整抽取所有可识别的候选题");
    expect(prompt.instructions).toContain("不要删除题干、选项、解析或参考答案中的图片链接");
    expect(prompt.input).not.toContain("1-8");
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
    expect(calls.find((call) => call.method === "createMany")).toMatchObject({
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

  it("imports external rich image blocks into platform assets", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createMaterialCandidateDb(calls);

    await createMaterialQuestionCandidates(
      "material_1",
      "job_1",
      [
        {
          stem: "观察题图后选择正确选项",
          stemBlocks: [
            { type: "text", text: "观察" },
            { type: "image", sourceUrl: "https://example.com/question.png", assetId: null, alt: "题图" },
            { type: "text", text: "后选择正确选项" }
          ],
          options: {
            A: "纯文本选项",
            B: "带图选项",
            C: "干扰项 C",
            D: "干扰项 D"
          },
          optionBlocks: {
            B: [
              { type: "text", text: "带图选项" },
              { type: "image", sourceUrl: "https://example.com/option-b.webp", assetId: null, alt: "选项图" }
            ]
          },
          answer: "B",
          explanation: "解析",
          explanationBlocks: [{ type: "image", sourceUrl: "https://example.com/explanation.jpg", assetId: null, alt: "解析图" }]
        }
      ],
      db as never,
      imageImportOptions(calls)
    );

    expect(calls.find((call) => call.method === "createMany")).toMatchObject({
      method: "createMany",
      args: {
        data: [
          expect.objectContaining({
            payload: {
              stemBlocks: [
                { type: "text", text: "观察" },
                { type: "image", sourceUrl: "https://example.com/question.png", assetId: "asset_1", alt: "题图" },
                { type: "text", text: "后选择正确选项" }
              ],
              options: [
                { key: "A", text: "纯文本选项" },
                {
                  key: "B",
                  text: "带图选项",
                  blocks: [
                    { type: "text", text: "带图选项" },
                    { type: "image", sourceUrl: "https://example.com/option-b.webp", assetId: "asset_2", alt: "选项图" }
                  ]
                },
                { key: "C", text: "干扰项 C" },
                { key: "D", text: "干扰项 D" }
              ],
              explanationBlocks: [{ type: "image", sourceUrl: "https://example.com/explanation.jpg", assetId: "asset_3", alt: "解析图" }]
            }
          })
        ]
      }
    });
    expect(calls.filter((call) => call.method === "asset.create")).toHaveLength(3);
    expect(calls.filter((call) => call.method === "writeStorageBytes")).toHaveLength(3);
  });

  it("deduplicates repeated external image URLs in one material extraction", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createMaterialCandidateDb(calls);

    await createMaterialQuestionCandidates(
      "material_1",
      "job_1",
      [
        {
          stem: "同图题",
          stemBlocks: [{ type: "image", sourceUrl: "https://img.example.com/render?id=1", assetId: null, alt: "题图" }],
          options: {
            A: "A",
            B: "B",
            C: "C",
            D: "D"
          },
          optionBlocks: {
            A: [{ type: "image", sourceUrl: "https://img.example.com/render?id=1#fragment", assetId: null, alt: "同图" }]
          },
          answer: "A"
        }
      ],
      db as never,
      imageImportOptions(calls)
    );

    const createCall = calls.find((call) => call.method === "createMany")!;

    expect(calls.filter((call) => call.method === "asset.create")).toHaveLength(1);
    expect(createCall).toMatchObject({
      args: {
        data: [
          expect.objectContaining({
            payload: expect.objectContaining({
              stemBlocks: [{ type: "image", sourceUrl: "https://img.example.com/render?id=1", assetId: "asset_1", alt: "题图" }],
              options: expect.arrayContaining([
                expect.objectContaining({
                  key: "A",
                  blocks: [{ type: "image", sourceUrl: "https://img.example.com/render?id=1#fragment", assetId: "asset_1", alt: "同图" }]
                })
              ])
            })
          })
        ]
      }
    });
  });

  it("keeps external URLs and records warnings when image import is disabled", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createMaterialCandidateDb(calls);

    await createMaterialQuestionCandidates(
      "material_1",
      "job_1",
      [
        {
          stem: "外链题",
          stemBlocks: [{ type: "image", sourceUrl: "https://example.com/question.png", assetId: null, alt: "题图" }],
          options: {
            A: "A",
            B: "B",
            C: "C",
            D: "D"
          },
          answer: "A"
        }
      ],
      db as never,
      imageImportOptions(calls, { env: { OPENEXAM_IMPORT_EXTERNAL_IMAGES: "false" } })
    );

    expect(calls.some((call) => call.method === "asset.create")).toBe(false);
    expect(calls.find((call) => call.method === "createMany")).toMatchObject({
      args: {
        data: [
          expect.objectContaining({
            payload: expect.objectContaining({
              stemBlocks: [{ type: "image", sourceUrl: "https://example.com/question.png", assetId: null, alt: "题图" }],
              imageImportWarnings: [
                {
                  sourceUrl: "https://example.com/question.png",
                  scope: "stemBlocks",
                  reason: "外链图片自动导入已关闭。"
                }
              ]
            })
          })
        ]
      }
    });
  });

  it("records warnings for images beyond the per-candidate import limit", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = createMaterialCandidateDb(calls);
    const stemBlocks = Array.from({ length: 9 }, (_, index) => ({
      type: "image" as const,
      sourceUrl: `https://example.com/question-${index}.png`,
      assetId: null,
      alt: `题图 ${index}`
    }));

    await createMaterialQuestionCandidates(
      "material_1",
      "job_1",
      [
        {
          stem: "多图题",
          stemBlocks,
          options: {
            A: "A",
            B: "B",
            C: "C",
            D: "D"
          },
          answer: "A"
        }
      ],
      db as never,
      imageImportOptions(calls)
    );

    expect(calls.filter((call) => call.method === "asset.create")).toHaveLength(8);
    expect(calls.find((call) => call.method === "createMany")).toMatchObject({
      args: {
        data: [
          expect.objectContaining({
            payload: expect.objectContaining({
              imageImportWarnings: [
                {
                  sourceUrl: "https://example.com/question-8.png",
                  scope: "stemBlocks",
                  reason: "单个候选题图片不能超过 8 张，已保留外链。"
                }
              ]
            })
          })
        ]
      }
    });
  });

  it("lists material candidates in separate paginated pending and confirmed sections", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      materialQuestionCandidate: {
        count: async (args: unknown) => {
          calls.push({ method: "count", args });

          return hasConfirmedStatus(args) ? 12 : 31;
        },
        findMany: async (args: unknown) => {
          calls.push({ method: "findMany", args });

          return [];
        }
      }
    };

    const result = await listMaterialQuestionCandidateSections(
      {
        materialId: "material_1",
        pendingPage: "3",
        confirmedPage: "2",
        pageSize: "10"
      },
      db as never
    );
    const findCalls = calls.filter((call) => call.method === "findMany");

    expect(result).toMatchObject({
      pageSize: 10,
      totalCount: 43,
      pending: {
        pagination: {
          page: 3,
          pageSize: 10,
          totalItems: 31,
          totalPages: 4,
          hasPreviousPage: true,
          hasNextPage: true,
          previousPage: 2,
          nextPage: 4
        }
      },
      confirmed: {
        pagination: {
          page: 2,
          pageSize: 10,
          totalItems: 12,
          totalPages: 2,
          hasPreviousPage: true,
          hasNextPage: false,
          previousPage: 1,
          nextPage: null
        }
      }
    });
    expect(findCalls[0].args).toMatchObject({
      where: {
        materialId: "material_1",
        status: {
          not: "confirmed"
        }
      },
      orderBy: [{ createdAt: "desc" }],
      skip: 20,
      take: 10
    });
    expect(findCalls[1].args).toMatchObject({
      where: {
        materialId: "material_1",
        status: "confirmed"
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: 10,
      take: 10
    });
  });

  it("falls back to default candidate pagination values for invalid query params", async () => {
    const db = {
      materialQuestionCandidate: {
        count: async () => 0,
        findMany: async () => []
      }
    };

    await expect(
      listMaterialQuestionCandidateSections(
        {
          pendingPage: "-1",
          confirmedPage: "abc",
          pageSize: "99"
        },
        db as never
      )
    ).resolves.toMatchObject({
      pageSize: 20,
      pending: {
        pagination: {
          page: 1,
          totalItems: 0,
          totalPages: 1
        }
      },
      confirmed: {
        pagination: {
          page: 1,
          totalItems: 0,
          totalPages: 1
        }
      }
    });
  });

  it("confirms personal material candidates into the owner's private approved uploaded questions", async () => {
    const writes: { method: string; args: unknown }[] = [];
    const db = materialConfirmDb({
      material: {
        ownerId: "user_1",
        libraryScope: "personal"
      },
      writes
    });

    await expect(confirmMaterialQuestionCandidate("candidate_1", db as never)).resolves.toEqual({
      ok: true,
      data: { questionId: "question_1" }
    });
    expect(writes[0]).toMatchObject({
      method: "question.create",
      args: {
        data: {
          ownerId: "user_1",
          sourceType: "user_uploaded",
          visibility: "private",
          reviewStatus: "approved",
          versions: {
            create: {
              sourceType: "user_uploaded",
              visibility: "private",
              reviewStatus: "approved"
            }
          }
        }
      }
    });
  });

  it("confirms platform material candidates into platform pending uploaded questions", async () => {
    const writes: { method: string; args: unknown }[] = [];
    const db = materialConfirmDb({
      material: {
        ownerId: "admin_1",
        libraryScope: "platform"
      },
      writes
    });

    await expect(confirmMaterialQuestionCandidate("candidate_1", db as never)).resolves.toEqual({
      ok: true,
      data: { questionId: "question_1" }
    });
    expect(writes[0]).toMatchObject({
      method: "question.create",
      args: {
        data: {
          ownerId: null,
          sourceType: "user_uploaded",
          visibility: "private",
          reviewStatus: "pending_review",
          versions: {
            create: {
              sourceType: "user_uploaded",
              visibility: "private",
              reviewStatus: "pending_review"
            }
          }
        }
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

  it("uses the configured material extraction context size for text materials", async () => {
    const originalStorageDir = process.env.LOCAL_STORAGE_DIR;
    const originalContextChars = process.env.OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS;
    const storageRoot = path.join(tmpdir(), `openexam-materials-context-${Date.now()}`);
    const storageKey = "materials/user_1/long.txt";
    const filePath = path.join(storageRoot, storageKey);

    process.env.LOCAL_STORAGE_DIR = storageRoot;
    process.env.OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS = "20";
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from("0123456789abcdefghijklmnopqrstuvwxyz"));

    const db = {
      material: {
        findUnique: async () => ({
          id: "material_1",
          ownerId: "user_1",
          title: "长文本资料",
          mimeType: "text/plain",
          sizeBytes: 36,
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

      expect(result.ok ? result.data.text : "").toBe("0123456789abcdefghij");
    } finally {
      if (originalStorageDir === undefined) {
        delete process.env.LOCAL_STORAGE_DIR;
      } else {
        process.env.LOCAL_STORAGE_DIR = originalStorageDir;
      }

      if (originalContextChars === undefined) {
        delete process.env.OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS;
      } else {
        process.env.OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS = originalContextChars;
      }
    }
  });

  it("reads JSON materials as text input for extraction", async () => {
    const originalStorageDir = process.env.LOCAL_STORAGE_DIR;
    const storageRoot = path.join(tmpdir(), `openexam-materials-json-${Date.now()}`);
    const storageKey = "materials/user_1/51cto.json";
    const filePath = path.join(storageRoot, storageKey);
    const json = JSON.stringify({
      detail: {
        question: [
          {
            question_title: "在详细设计结束后，以下选项中不是重点审查内容的是？",
            option: ["数据流图", "软件界面", "算法", "数据结构"],
            answer: ["A"]
          }
        ]
      }
    });

    process.env.LOCAL_STORAGE_DIR = storageRoot;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(json));

    const db = {
      material: {
        findUnique: async () => ({
          id: "material_1",
          ownerId: "user_1",
          title: "51CTO JSON",
          mimeType: "application/json",
          sizeBytes: json.length,
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
      expect(result.ok ? result.data.extractionMethod : "").toBe("local_text");
      expect(result.ok ? result.data.text : "").toContain("详细设计");
    } finally {
      if (originalStorageDir === undefined) {
        delete process.env.LOCAL_STORAGE_DIR;
      } else {
        process.env.LOCAL_STORAGE_DIR = originalStorageDir;
      }
    }
  });

  it("returns a clear error when a material file is missing", async () => {
    const originalStorageDir = process.env.LOCAL_STORAGE_DIR;
    const storageRoot = path.join(tmpdir(), `openexam-materials-missing-${Date.now()}`);

    process.env.LOCAL_STORAGE_DIR = storageRoot;

    const db = {
      material: {
        findUnique: async () => ({
          id: "material_1",
          ownerId: "user_1",
          title: "缺失资料",
          mimeType: "text/plain",
          sizeBytes: 10,
          sha256: "hash",
          storageKey: "materials/user_1/missing.txt",
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
      await expect(readMaterialText("material_1", db as never)).resolves.toEqual({
        ok: false,
        error: "资料文件不存在或存储卷未挂载，请重新上传资料。"
      });
    } finally {
      if (originalStorageDir === undefined) {
        delete process.env.LOCAL_STORAGE_DIR;
      } else {
        process.env.LOCAL_STORAGE_DIR = originalStorageDir;
      }
    }
  });
});

function hasConfirmedStatus(args: unknown) {
  if (!args || typeof args !== "object" || !("where" in args)) {
    return false;
  }

  const where = (args as { where?: { status?: unknown } }).where;

  return where?.status === "confirmed";
}

function createMaterialCandidateDb(calls: { method: string; args?: unknown }[]) {
  return {
    material: {
      findUnique: async (args: unknown) => {
        calls.push({ method: "material.findUnique", args });
        return { id: "material_1", ownerId: "user_1" };
      }
    },
    asset: {
      create: async (args: unknown) => {
        calls.push({ method: "asset.create", args });
        return { id: `asset_${calls.filter((call) => call.method === "asset.create").length}` };
      }
    },
    materialQuestionCandidate: {
      deleteMany: async (args: unknown) => {
        calls.push({ method: "deleteMany", args });
        return { count: 0 };
      },
      createMany: async (args: unknown) => {
        calls.push({ method: "createMany", args });
        return { count: 1 };
      }
    }
  };
}

function imageImportOptions(calls: { method: string; args?: unknown }[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return {
    env: {
      DATABASE_URL: "postgresql://openexam:openexam@localhost:5432/openexam?schema=public",
      ...options.env
    },
    fetch: async () =>
      new Response(fakePngBytes(), {
        headers: {
          "content-length": String(fakePngBytes().length),
          "content-type": "image/png"
        }
      }),
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    writeStorageBytes: async (args: unknown) => {
      calls.push({ method: "writeStorageBytes", args });
      return { storageKey: (args as { storageKey: string }).storageKey };
    }
  };
}

function fakePngBytes() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
}

function materialConfirmDb({
  material,
  writes
}: {
  material: { ownerId: string; libraryScope: "personal" | "platform" };
  writes: { method: string; args: unknown }[];
}) {
  return {
    materialQuestionCandidate: {
      findUnique: async () => ({
        id: "candidate_1",
        materialId: "material_1",
        jobId: "job_1",
        kind: "single_choice",
        stem: "黑盒测试的主要依据是（）。",
        payload: {
          options: [
            { key: "A", text: "程序代码" },
            { key: "B", text: "需求规格说明" },
            { key: "C", text: "开发语言" },
            { key: "D", text: "数据库结构" }
          ]
        },
        answerKey: { value: "B" },
        explanation: "黑盒测试依据规格说明。",
        difficulty: 2,
        knowledgeNodeId: "node_1",
        sourceRef: "第 1 段",
        status: "pending",
        confirmedQuestionId: null,
        createdAt: new Date("2026-05-05T00:00:00.000Z"),
        updatedAt: new Date("2026-05-05T00:00:00.000Z"),
        material: {
          id: "material_1",
          ownerId: material.ownerId,
          libraryScope: material.libraryScope,
          title: "软件测试资料",
          mimeType: "text/plain",
          sizeBytes: 10,
          sha256: "hash",
          storageKey: "materials/user_1/test.txt",
          bindingScope: "subject:subject_1",
          extractionState: "succeeded",
          extractionMethod: "local_text",
          extractionError: null,
          sourceLicense: "自用资料",
          createdAt: new Date("2026-05-05T00:00:00.000Z"),
          updatedAt: new Date("2026-05-05T00:00:00.000Z")
        }
      })
    },
    knowledgeNode: {
      findUnique: async () => ({ id: "node_1" })
    },
    $transaction: async (callback: (tx: {
      question: { create: (args: unknown) => Promise<{ id: string }> };
      materialQuestionCandidate: { update: (args: unknown) => Promise<{ id: string }> };
    }) => Promise<{ id: string }>) =>
      callback({
        question: {
          create: async (args: unknown) => {
            writes.push({ method: "question.create", args });
            return { id: "question_1" };
          }
        },
        materialQuestionCandidate: {
          update: async (args: unknown) => {
            writes.push({ method: "candidate.update", args });
            return { id: "candidate_1" };
          }
        }
      })
  };
}
