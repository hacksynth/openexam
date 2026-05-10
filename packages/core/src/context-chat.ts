import { AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, modelForCredential, resolveAiCredential, resolveTaskAiPreset, type AiTextGenerator, type AiTextInputPart } from "./ai";
import { formatGoalPath } from "./exam-core";
import { readMaterialText } from "./materials";
import { buildPagination, type PaginationInput } from "./pagination";
import { formatAnswerValue, readObjectiveAnswerKey, readSingleChoiceOptions, readSubmittedAnswer } from "./practice";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

type ChatDatabase = typeof prisma;

export const contextChatContextTypes = ["question", "wrong_note", "knowledge_node", "study_plan", "attempt", "material"] as const;
export type ContextChatContextType = (typeof contextChatContextTypes)[number];

const promptVersion = "context-chat-v1";
const defaultMaxOutputTokens = 1000;

export async function listContextChatThreads(userId: string, options: PaginationInput = {}, db: ChatDatabase = prisma) {
  const where = { userId };
  const totalItems = await db.aiChatThread.count({ where });
  const pagination = buildPagination(options, totalItems);
  const threads = await db.aiChatThread.findMany({
    where,
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }],
        take: 1
      }
    },
    orderBy: [{ updatedAt: "desc" }],
    skip: pagination.skip,
    take: pagination.take
  });

  return {
    pagination,
    items: threads.map((thread) => ({
      id: thread.id,
      title: thread.title,
      contextType: thread.contextType,
      contextId: thread.contextId,
      inputContextSource: thread.inputContextSource,
      lastMessage: thread.messages[0]?.content ?? null,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt
    }))
  };
}

export async function getContextChatThread(userId: string, threadId: string, db: ChatDatabase = prisma) {
  const thread = await db.aiChatThread.findFirst({
    where: {
      id: threadId.trim(),
      userId
    },
    include: {
      messages: {
        orderBy: [{ createdAt: "asc" }]
      }
    }
  });

  return thread
    ? {
        id: thread.id,
        title: thread.title,
        contextType: thread.contextType,
        contextId: thread.contextId,
        inputContextSource: thread.inputContextSource,
        messages: thread.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          aiCallId: message.aiCallId,
          createdAt: message.createdAt
        })),
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      }
    : null;
}

export async function sendContextChatMessage(
  userId: string,
  input: {
    message: string;
    threadId?: string | null;
    contextType?: string | null;
    contextId?: string | null;
  },
  options: {
    db?: ChatDatabase;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ threadId: string; aiCallId: string; answer: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const message = input.message.trim();

  if (!message) {
    return { ok: false, error: "请输入问题。" };
  }

  const threadResult = await resolveThreadForMessage(userId, input, db);

  if (!threadResult.ok) {
    return threadResult;
  }

  const { thread, context } = threadResult.data;
  const presetResult = await resolveChatPreset(db, requiredContextCapability(context.aiInputParts));

  if (!presetResult.ok) {
    return presetResult;
  }

  const preset = presetResult.data;
  const credential = options.generateText ? null : await resolveAiCredential(userId, preset.provider, db, env);

  if (credential?.ok === false) {
    return credential;
  }

  if (credential?.ok) {
    const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

    if (!usageAllowed.ok) {
      return usageAllowed;
    }
  }

  const model = modelForCredential(preset, credential);
  const history = await db.aiChatMessage.findMany({
    where: { threadId: thread.id },
    orderBy: [{ createdAt: "desc" }],
    take: 10
  });
  const prompt = buildContextChatPrompt({
    title: context.title,
    contextSource: context.source,
    contextBody: context.body,
    history: history.reverse().map((item) => ({ role: item.role, content: item.content })),
    message
  });
  const aiInput = context.aiInputParts.length > 0 ? ([{ type: "text" as const, text: prompt.input }, ...context.aiInputParts] satisfies AiTextInputPart[]) : prompt.input;
  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model,
      taskType: AiTaskType.chat_with_context,
      promptVersion,
      inputContextSource: context.source,
      tokenEstimate: Math.ceil(prompt.input.length / 4),
      imageCount: context.aiInputParts.length || null,
      credentialSource: credential?.ok ? credential.data.source : "test",
      status: "running"
    }
  });

  await db.aiChatMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      content: message
    }
  });

  try {
    const result = await (options.generateText ?? generateAiText)({
      provider: preset.provider,
      apiKey: credential?.ok ? credential.data.apiKey : "test-key",
      baseURL: credential?.ok ? credential.data.baseURL : null,
      apiMode: credential?.ok ? credential.data.apiMode : null,
      model,
      instructions: prompt.instructions,
      input: aiInput,
      maxOutputTokens: preset.maxOutputTokens,
      temperature: preset.temperature
    });
    const answer = result.text.trim();

    if (!answer) {
      throw new Error("AI 没有返回回答。");
    }

    await db.$transaction([
      db.aiChatMessage.create({
        data: {
          threadId: thread.id,
          role: "assistant",
          content: answer,
          aiCallId: aiCall.id
        }
      }),
      db.aiChatThread.update({
        where: { id: thread.id },
        data: {
          title: thread.title,
          updatedAt: new Date()
        }
      }),
      db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          status: "succeeded",
          usage: result.usage ?? undefined,
          errorSummary: null
        }
      })
    ]);

    return { ok: true, data: { threadId: thread.id, aiCallId: aiCall.id, answer } };
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message.slice(0, 240) : "上下文对话生成失败。";

    await db.aiCall.update({
      where: { id: aiCall.id },
      data: {
        status: "failed",
        errorSummary
      }
    });

    return { ok: false, error: errorSummary };
  }
}

export function buildContextChatPrompt(input: {
  title: string;
  contextSource: string;
  contextBody: string;
  history: { role: string; content: string }[];
  message: string;
}) {
  return {
    instructions: "你是 OpenExam 的上下文学习助手。只基于给定上下文和对话历史回答；无法从上下文确定时要明确说明。使用简体中文，输出短段落。",
    input: [
      `上下文来源：${input.contextSource}`,
      `上下文标题：${input.title}`,
      "",
      "上下文内容：",
      input.contextBody || "上下文内容来自随附文件或图片，请先读取随附内容。",
      "",
      "最近对话：",
      input.history.map((item) => `${item.role === "assistant" ? "助手" : "用户"}：${item.content}`).join("\n") || "暂无",
      "",
      `用户问题：${input.message}`,
      "",
      "回答要求：聚焦备考解释、易错点、例题思路或复习动作；不要编造上下文外事实。"
    ].join("\n")
  };
}

async function resolveThreadForMessage(
  userId: string,
  input: { threadId?: string | null; contextType?: string | null; contextId?: string | null },
  db: ChatDatabase
): Promise<ActionResult<{ thread: { id: string; title: string }; context: ResolvedChatContext }>> {
  const threadId = input.threadId?.trim();

  if (threadId) {
    const thread = await db.aiChatThread.findFirst({
      where: {
        id: threadId,
        userId
      }
    });

    if (!thread) {
      return { ok: false, error: "对话不存在。" };
    }

    const context = await resolveChatContext(userId, thread.contextType, thread.contextId, db);

    return context.ok ? { ok: true, data: { thread: { id: thread.id, title: thread.title }, context: context.data } } : context;
  }

  const context = await resolveChatContext(userId, input.contextType, input.contextId, db);

  if (!context.ok) {
    return context;
  }

  const thread = await db.aiChatThread.create({
    data: {
      userId,
      title: context.data.title,
      contextType: context.data.contextType,
      contextId: context.data.contextId,
      inputContextSource: context.data.source
    }
  });

  return { ok: true, data: { thread: { id: thread.id, title: thread.title }, context: context.data } };
}

type ResolvedChatContext = {
  contextType: ContextChatContextType;
  contextId: string;
  source: string;
  title: string;
  body: string;
  aiInputParts: AiTextInputPart[];
};

async function resolveChatContext(userId: string, contextType: string | null | undefined, contextId: string | null | undefined, db: ChatDatabase): Promise<ActionResult<ResolvedChatContext>> {
  const type = parseContextType(contextType);
  const id = contextId?.trim();

  if (!type || !id) {
    return { ok: false, error: "请选择有效的对话上下文。" };
  }

  if (type === "material") {
    const material = await db.material.findFirst({
      where: {
        id,
        ownerId: userId,
        libraryScope: "personal"
      },
      select: {
        id: true,
        title: true
      }
    });

    if (!material) {
      return { ok: false, error: "资料不存在或不可访问。" };
    }

    const materialText = await readMaterialText(material.id, db);

    if (!materialText.ok) {
      return { ok: false, error: materialText.error };
    }

    return {
      ok: true,
      data: {
        contextType: type,
        contextId: material.id,
        source: `material:${material.id}`,
        title: `资料：${material.title}`,
        body: materialText.data.text.slice(0, 14000),
        aiInputParts: materialText.data.ocrInput ? [materialText.data.ocrInput] : []
      }
    };
  }

  if (type === "wrong_note") {
    const note = await db.wrongNote.findFirst({
      where: { id, userId },
      include: {
        question: {
          include: {
            knowledgeBindings: {
              include: { knowledgeNode: true }
            },
            versions: {
              orderBy: { version: "desc" },
              take: 1
            }
          }
        }
      }
    });

    if (!note) {
      return { ok: false, error: "错题不存在或不可访问。" };
    }

    const version = note.question.versions[0] ?? null;

    return {
      ok: true,
      data: {
        contextType: type,
        contextId: note.id,
        source: `wrong_note:${note.id}`,
        title: `错题：${(version?.stem ?? note.question.stem).slice(0, 40)}`,
        body: [
          `题干：${version?.stem ?? note.question.stem}`,
          `题型：${note.question.kind}`,
          `选项：${formatOptions(readSingleChoiceOptions(version?.payload ?? note.question.payload) ?? [])}`,
          `正确答案：${formatAnswerValue(readObjectiveAnswerKey(version?.answerKey ?? note.question.answerKey)) ?? "未配置"}`,
          `解析：${version?.explanation ?? note.question.explanation ?? "暂无"}`,
          `知识点：${note.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title).join(" / ") || "未绑定"}`,
          `累计错误次数：${note.errorCount}`,
          `用户笔记：${note.userNotes || "暂无"}`
        ].join("\n"),
        aiInputParts: []
      }
    };
  }

  if (type === "question") {
    const question = await db.question.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { visibility: "public", reviewStatus: "approved" },
          { ownerId: userId, visibility: "private" }
        ]
      },
      include: {
        knowledgeBindings: {
          include: { knowledgeNode: true }
        },
        versions: {
          orderBy: { version: "desc" },
          take: 1
        }
      }
    });

    if (!question) {
      return { ok: false, error: "题目不存在或不可访问。" };
    }

    const version = question.versions[0] ?? null;

    return {
      ok: true,
      data: {
        contextType: type,
        contextId: question.id,
        source: `question:${question.id}`,
        title: `题目：${(version?.stem ?? question.stem).slice(0, 40)}`,
        body: [
          `题干：${version?.stem ?? question.stem}`,
          `题型：${question.kind}`,
          `选项：${formatOptions(readSingleChoiceOptions(version?.payload ?? question.payload) ?? [])}`,
          `参考答案：${formatAnswerValue(readObjectiveAnswerKey(version?.answerKey ?? question.answerKey)) ?? "未配置"}`,
          `解析：${version?.explanation ?? question.explanation ?? "暂无"}`,
          `知识点：${question.knowledgeBindings.map((binding) => binding.knowledgeNode.title).join(" / ") || "未绑定"}`
        ].join("\n"),
        aiInputParts: []
      }
    };
  }

  if (type === "knowledge_node") {
    const node = await db.knowledgeNode.findFirst({
      where: {
        id,
        syllabus: {
          subject: {
            cycle: {
              track: {
                program: {
                  goals: {
                    some: {
                      userId,
                      isPrimary: true
                    }
                  }
                }
              }
            }
          }
        }
      },
      include: {
        syllabus: {
          include: {
            subject: {
              include: {
                cycle: {
                  include: {
                    track: {
                      include: {
                        program: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        userNotes: {
          where: { userId },
          take: 1
        }
      }
    });

    if (!node) {
      return { ok: false, error: "知识点不存在或不在当前目标范围内。" };
    }

    return {
      ok: true,
      data: {
        contextType: type,
        contextId: node.id,
        source: `knowledge_node:${node.id}`,
        title: `知识点：${node.title}`,
        body: [
          `考试：${node.syllabus.subject.cycle.track.program.name} / ${node.syllabus.subject.cycle.track.name} / ${node.syllabus.subject.cycle.name} / ${node.syllabus.subject.name}`,
          `知识点：${node.code ? `${node.code} ` : ""}${node.title}`,
          `描述：${node.description || "暂无"}`,
          `考试要求：${node.examExpectation || "暂无"}`,
          `用户笔记：${node.userNotes[0]?.note || "暂无"}`
        ].join("\n"),
        aiInputParts: []
      }
    };
  }

  if (type === "study_plan") {
    const plan = await db.studyPlan.findFirst({
      where: {
        id,
        userId
      },
      include: {
        goal: {
          include: {
            program: true,
            track: true,
            cycle: true,
            subject: true
          }
        },
        tasks: {
          orderBy: [{ day: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!plan) {
      return { ok: false, error: "学习计划不存在或不可访问。" };
    }

    return {
      ok: true,
      data: {
        contextType: type,
        contextId: plan.id,
        source: `study_plan:${plan.id}`,
        title: `学习计划：${formatGoalPath(plan.goal)}`,
        body: [
          `目标：${formatGoalPath(plan.goal)}`,
          `状态：${plan.status}`,
          `任务：`,
          plan.tasks
            .map((task) => {
              const taskStatus = task.status || (task.completedAt ? "completed" : "pending");
              const scheduledDate = task.scheduledDate?.toISOString().slice(0, 10) ?? `第 ${task.day} 天`;

              return `${scheduledDate} 第 ${task.day} 天 ${task.kind} ${task.minutes} 分钟：${task.title}（${taskStatus}）`;
            })
            .join("\n")
        ].join("\n"),
        aiInputParts: []
      }
    };
  }

  const attempt = await db.attempt.findFirst({
    where: {
      id,
      userId
    },
    include: {
      paper: true,
      goal: {
        include: {
          program: true,
          track: true,
          cycle: true,
          subject: true
        }
      },
      answers: {
        include: {
          question: {
            include: {
              knowledgeBindings: {
                include: { knowledgeNode: true }
              }
            }
          },
          questionVersion: true
        },
        orderBy: [{ createdAt: "asc" }]
      }
    }
  });

  if (!attempt) {
    return { ok: false, error: "作答记录不存在或不可访问。" };
  }

  return {
    ok: true,
    data: {
      contextType: type,
      contextId: attempt.id,
      source: `attempt:${attempt.id}`,
      title: `作答记录：${attempt.paper?.title ?? "单题练习"}`,
      body: [
        `目标：${attempt.goal ? formatGoalPath(attempt.goal) : "未绑定"}`,
        `试卷：${attempt.paper?.title ?? "单题练习"}`,
        `得分：${attempt.totalScore ?? 0} / ${attempt.maxScore ?? 0}`,
        "答题明细：",
        attempt.answers
          .map((answer, index) => {
            const version = answer.questionVersion;
            const answerKey = readObjectiveAnswerKey(version?.answerKey ?? answer.question.answerKey);

            return [
              `${index + 1}. ${version?.stem ?? answer.question.stem}`,
              `用户答案：${readSubmittedAnswer(answer.userAnswer) || "未记录"}`,
              `参考答案：${formatAnswerValue(answerKey) ?? "未配置"}`,
              `结果：${answer.isCorrect === null ? "待评分" : answer.isCorrect ? "正确" : "错误"}`,
              `解析：${version?.explanation ?? answer.question.explanation ?? "暂无"}`,
              `知识点：${answer.question.knowledgeBindings.map((binding) => binding.knowledgeNode.title).join(" / ") || "未绑定"}`
            ].join("\n")
          })
          .join("\n\n")
      ].join("\n"),
      aiInputParts: []
    }
  };
}

function parseContextType(value: string | null | undefined): ContextChatContextType | null {
  return contextChatContextTypes.includes(value as ContextChatContextType) ? (value as ContextChatContextType) : null;
}

function requiredContextCapability(parts: AiTextInputPart[]): "text" | "vision" | "document" {
  if (parts.some((part) => part.type === "document")) {
    return "document";
  }

  return parts.some((part) => part.type === "image") ? "vision" : "text";
}

async function resolveChatPreset(db: ChatDatabase, requiredCapability: "text" | "vision" | "document") {
  return resolveTaskAiPreset(db, AiTaskType.chat_with_context, requiredCapability, {
    defaultMaxOutputTokens
  });
}

function formatOptions(options: { key: string; text: string }[]) {
  return options.map((option) => `${option.key}. ${option.text}`).join(" / ") || "无选项";
}
