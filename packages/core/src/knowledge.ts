import { AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, resolveAiCredential, resolveTaskAiPreset, type AiTextGenerator } from "./ai";
import { formatGoalPath, getPrimaryExamGoal, type PrimaryGoal } from "./exam-core";
import { buildPracticeQuestionWhere } from "./practice";
import { prisma } from "./prisma";

export type KnowledgeTreeRecord = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
};

export type KnowledgeTreePathSegment = {
  id: string;
  code: string | null;
  title: string;
};

export type KnowledgeTreeItem<T extends KnowledgeTreeRecord> = T & {
  children: KnowledgeTreeItem<T>[];
  depth: number;
  directChildCount: number;
  descendantCount: number;
  path: KnowledgeTreePathSegment[];
};

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

export type KnowledgeNodeDetail = KnowledgeNodeView & {
  knowledgePath: string;
  subtree: KnowledgeTreeItem<KnowledgeNodeView>;
  relatedQuestions: {
    id: string;
    kind: string;
    stem: string;
    difficulty: number | null;
    recentAnswerCorrect: boolean | null;
  }[];
};

export function buildKnowledgeTree<T extends KnowledgeTreeRecord>(nodes: readonly T[]): KnowledgeTreeItem<T>[] {
  const itemById = new Map<string, KnowledgeTreeItem<T>>();
  const roots: KnowledgeTreeItem<T>[] = [];

  for (const node of nodes) {
    itemById.set(node.id, {
      ...node,
      children: [],
      depth: 0,
      directChildCount: 0,
      descendantCount: 0,
      path: []
    });
  }

  for (const node of nodes) {
    const item = itemById.get(node.id);

    if (!item) {
      continue;
    }

    const parent = node.parentId ? itemById.get(node.parentId) : null;

    if (parent && parent.id !== item.id) {
      parent.children.push(item);
    } else {
      roots.push(item);
    }
  }

  for (const root of roots) {
    assignKnowledgeTreeMetadata(root, 0, []);
  }

  return roots;
}

export function flattenKnowledgeTree<T extends KnowledgeTreeRecord>(tree: readonly KnowledgeTreeItem<T>[]): KnowledgeTreeItem<T>[] {
  const flattened: KnowledgeTreeItem<T>[] = [];

  for (const item of tree) {
    flattened.push(item, ...flattenKnowledgeTree(item.children));
  }

  return flattened;
}

export function findKnowledgeTreeItem<T extends KnowledgeTreeRecord>(tree: readonly KnowledgeTreeItem<T>[], id: string): KnowledgeTreeItem<T> | null {
  for (const item of tree) {
    if (item.id === id) {
      return item;
    }

    const child = findKnowledgeTreeItem(item.children, id);

    if (child) {
      return child;
    }
  }

  return null;
}

export async function getKnowledgeNode(userId: string, nodeId: string, db = prisma): Promise<KnowledgeNodeDetail | null> {
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) return null;

  const normalizedNodeId = nodeId.trim();
  const dashboard = await buildKnowledgeDashboard(userId, goal, db);
  const node = dashboard.nodes.find((candidate) => candidate.id === normalizedNodeId);
  const subtree = findKnowledgeTreeItem(dashboard.tree, normalizedNodeId);

  if (!node || !subtree) return null;

  const treeNodes = dashboard.nodes.map((item) => ({ id: item.id, parentId: item.parentId, code: item.code, title: item.title }));
  const subtreeNodeIds = collectSubtreeNodeIds(node.id, treeNodes);
  const relatedQuestions = subtreeNodeIds.length > 0
    ? await db.question.findMany({
        where: {
          AND: [
            buildPracticeQuestionWhere(userId, goal),
            {
              knowledgeBindings: {
                some: {
                  knowledgeNodeId: {
                    in: subtreeNodeIds
                  }
                }
              }
            }
          ]
        },
        include: {
          knowledgeBindings: true
        },
        orderBy: [{ difficulty: "asc" }, { updatedAt: "asc" }],
        take: 50
      })
    : [];
  const questionIds = relatedQuestions.map((question) => question.id);
  const recentAnswers = questionIds.length > 0
    ? await db.attemptAnswer.findMany({
        where: {
          attempt: {
            userId,
            goalId: goal.id,
            status: {
              in: ["submitted", "graded"]
            }
          },
          questionId: { in: questionIds }
        },
        orderBy: { updatedAt: "desc" },
        take: 100
      })
    : [];

  const answerByQuestion = new Map<string, typeof recentAnswers[0]>();
  for (const answer of recentAnswers) {
    if (!answerByQuestion.has(answer.questionId)) {
      answerByQuestion.set(answer.questionId, answer);
    }
  }

  return {
    ...node,
    knowledgePath: formatKnowledgePath(subtree.path),
    subtree,
    relatedQuestions: relatedQuestions.slice(0, 20).map((question) => {
      const lastAnswer = answerByQuestion.get(question.id);
      return {
        id: question.id,
        kind: question.kind,
        stem: question.stem.length > 80 ? question.stem.slice(0, 80) + "..." : question.stem,
        difficulty: question.difficulty ?? null,
        recentAnswerCorrect: lastAnswer ? (lastAnswer.isCorrect ?? null) : null
      };
    })
  };
}

export type KnowledgeDashboardState =
  | { status: "no_goal" }
  | {
      status: "ready";
      goal: NonNullable<PrimaryGoal>;
      goalPath: string;
      nodes: KnowledgeNodeView[];
      tree: KnowledgeTreeItem<KnowledgeNodeView>[];
    };

export type KnowledgeNodeView = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  examExpectation: string | null;
  subjectPath: string;
  questionCount: number;
  recentTotal: number;
  recentCorrect: number;
  accuracy: number;
  newQuestionCount: number;
  practicedQuestionCount: number;
  pendingWrongNotes: number;
  commonErrors: string[];
  note: {
    note: string;
    aiExplanation: string | null;
    updatedAt: Date;
  } | null;
};

export async function getKnowledgeDashboard(userId: string, db = prisma): Promise<KnowledgeDashboardState> {
  const goal = await getPrimaryExamGoal(userId);

  if (!goal) {
    return { status: "no_goal" };
  }

  const dashboard = await buildKnowledgeDashboard(userId, goal, db);

  return {
    status: "ready",
    goal,
    goalPath: formatGoalPath(goal),
    ...dashboard
  };
}

async function buildKnowledgeDashboard(userId: string, goal: NonNullable<PrimaryGoal>, db: typeof prisma) {
  const [nodes, practiceableQuestions, answers, wrongNotes, notes] = await Promise.all([
    db.knowledgeNode.findMany({
      where: buildKnowledgeNodeWhere(goal),
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
        questionBindings: true
      },
      orderBy: [{ code: "asc" }, { title: "asc" }]
    }),
    db.question.findMany({
      where: buildPracticeQuestionWhere(userId, goal),
      include: {
        knowledgeBindings: true
      }
    }),
    db.attemptAnswer.findMany({
      where: {
        attempt: {
          userId,
          goalId: goal.id,
          status: {
            in: ["submitted", "graded"]
          }
        }
      },
      select: {
        id: true,
        questionId: true,
        isCorrect: true,
        updatedAt: true
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 300
    }),
    db.wrongNote.findMany({
      where: {
        userId,
        mastered: false,
        errorCount: {
          gt: 0
        },
        question: buildPracticeQuestionWhere(userId, goal)
      },
      include: {
        question: {
          include: {
            knowledgeBindings: true,
            versions: {
              orderBy: { version: "desc" },
              take: 1
            }
          }
        }
      }
    }),
    db.userKnowledgeNote.findMany({
      where: {
        userId
      }
    })
  ]);
  const noteByNode = new Map(notes.map((note) => [note.knowledgeNodeId, note]));
  const treeNodes = nodes.map((node) => ({ id: node.id, parentId: node.parentId, code: node.code, title: node.title }));
  const directQuestionIdsByNode = new Map<string, Set<string>>();
  const latestAnswerByQuestion = new Map<string, (typeof answers)[number]>();
  const wrongNoteByQuestion = new Map(wrongNotes.map((wrongNote) => [wrongNote.questionId, wrongNote]));
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const question of practiceableQuestions) {
    for (const binding of question.knowledgeBindings) {
      if (!nodeIds.has(binding.knowledgeNodeId)) {
        continue;
      }

      const current = directQuestionIdsByNode.get(binding.knowledgeNodeId) ?? new Set<string>();
      current.add(question.id);
      directQuestionIdsByNode.set(binding.knowledgeNodeId, current);
    }
  }

  for (const answer of answers) {
    if (!latestAnswerByQuestion.has(answer.questionId)) {
      latestAnswerByQuestion.set(answer.questionId, answer);
    }
  }

  const views = nodes.map((node) => {
    const subtreeNodeIds = collectSubtreeNodeIds(node.id, treeNodes);
    const questionIds = collectQuestionIdsForNodes(subtreeNodeIds, directQuestionIdsByNode);
    const practicedQuestionIds = questionIds.filter((questionId) => latestAnswerByQuestion.has(questionId));
    const recentCorrect = practicedQuestionIds.filter((questionId) => latestAnswerByQuestion.get(questionId)?.isCorrect === true).length;
    const wrongNotesForNode = questionIds.flatMap((questionId) => {
      const wrongNote = wrongNoteByQuestion.get(questionId);
      return wrongNote ? [wrongNote] : [];
    });
    const commonErrors = wrongNotesForNode.slice(0, 3).map((wrongNote) => wrongNote.question.versions[0]?.stem ?? wrongNote.question.stem);
    const note = noteByNode.get(node.id);

    return {
      id: node.id,
      parentId: node.parentId,
      code: node.code,
      title: node.title,
      description: node.description,
      examExpectation: node.examExpectation,
      subjectPath: formatSubjectPath(node.syllabus.subject),
      questionCount: questionIds.length,
      recentTotal: practicedQuestionIds.length,
      recentCorrect,
      accuracy: practicedQuestionIds.length > 0 ? Math.round((recentCorrect / practicedQuestionIds.length) * 100) : 0,
      newQuestionCount: questionIds.length - practicedQuestionIds.length,
      practicedQuestionCount: practicedQuestionIds.length,
      pendingWrongNotes: wrongNotesForNode.length,
      commonErrors,
      note: note
        ? {
            note: note.note,
            aiExplanation: note.aiExplanation,
            updatedAt: note.updatedAt
          }
        : null
    };
  });

  return {
    nodes: views,
    tree: buildKnowledgeTree(views)
  };
}

export async function saveKnowledgeNote(
  userId: string,
  input: {
    knowledgeNodeId: string;
    note: string;
  },
  db = prisma
): Promise<ActionResult> {
  const knowledgeNodeId = input.knowledgeNodeId.trim();
  const note = input.note.trim();

  if (!knowledgeNodeId) {
    return { ok: false, error: "知识点不存在。" };
  }

  if (!note) {
    await db.userKnowledgeNote.deleteMany({
      where: {
        userId,
        knowledgeNodeId
      }
    });

    return { ok: true };
  }

  await db.userKnowledgeNote.upsert({
    where: {
      userId_knowledgeNodeId: {
        userId,
        knowledgeNodeId
      }
    },
    update: {
      note
    },
    create: {
      userId,
      knowledgeNodeId,
      note
    }
  });

  return { ok: true };
}

export async function generateKnowledgeExplanation(
  userId: string,
  knowledgeNodeId: string,
  options: {
    db?: typeof prisma;
    env?: NodeJS.ProcessEnv;
    generateText?: AiTextGenerator;
  } = {}
): Promise<ActionResult<{ explanation: string; aiCallId: string }>> {
  const db = options.db ?? prisma;
  const env = options.env ?? process.env;
  const node = await db.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId.trim() },
    include: {
      syllabus: {
        include: {
          subject: true
        }
      },
      userNotes: {
        where: { userId },
        take: 1
      }
    }
  });

  if (!node) {
    return { ok: false, error: "知识点不存在。" };
  }

  const syllabusNodes = await db.knowledgeNode.findMany({
    where: {
      syllabusId: node.syllabusId
    },
    select: {
      id: true,
      parentId: true,
      code: true,
      title: true,
      description: true,
      examExpectation: true
    },
    orderBy: [{ code: "asc" }, { title: "asc" }]
  });
  const syllabusTree = buildKnowledgeTree(syllabusNodes);
  const subtree = findKnowledgeTreeItem(syllabusTree, node.id);
  const subtreeLines = subtree ? formatPromptSubtree(subtree).slice(0, 24) : [];
  const presetResult = await resolveKnowledgePreset(db);

  if (!presetResult.ok) {
    return presetResult;
  }

  const preset = presetResult.data;
  const prompt = {
    instructions: "你是 OpenExam 的知识点范围讲解助手。只根据给定知识点、子树结构、大纲要求和用户笔记解释，用简体中文，输出短段落。",
    input: [
      `当前范围：${node.code ? `${node.code} ` : ""}${node.title}`,
      `描述：${node.description || "暂无"}`,
      `考试要求：${node.examExpectation || "暂无"}`,
      `用户笔记：${node.userNotes[0]?.note || "暂无"}`,
      `子树结构：\n${subtreeLines.length > 1 ? subtreeLines.join("\n") : "无更细子项"}`,
      "请给出：核心概念、子树学习顺序、考试常见问法、易错点、一个复习动作。"
    ].join("\n")
  };
  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model: preset.model,
      taskType: AiTaskType.chat_with_context,
      promptVersion: "knowledge-node-explain-v2",
      inputContextSource: `knowledge_node:${node.id}`,
      tokenEstimate: Math.ceil(prompt.input.length / 4),
      status: "running"
    }
  });

  try {
    const credential = options.generateText ? null : await resolveAiCredential(userId, preset.provider, db, env);

    if (credential?.ok === false) {
      await markAiCallFailed(aiCall.id, credential.error, db);
      return { ok: false, error: credential.error };
    }

    if (credential?.ok) {
      const usageAllowed = await assertAiUsageAllowed(userId, credential.data.source, db, env);

      if (!usageAllowed.ok) {
        await markAiCallFailed(aiCall.id, usageAllowed.error, db);
        return usageAllowed;
      }

      await db.aiCall.update({
        where: { id: aiCall.id },
        data: {
          credentialSource: credential.data.source
        }
      });
    }

    const result = await (options.generateText ?? generateAiText)({
      provider: preset.provider,
      apiKey: credential?.ok ? credential.data.apiKey : "test-key",
      baseURL: credential?.ok ? credential.data.baseURL : null,
      apiMode: credential?.ok ? credential.data.apiMode : null,
      model: preset.model,
      instructions: prompt.instructions,
      input: prompt.input,
      maxOutputTokens: preset.maxOutputTokens,
      temperature: preset.temperature
    });
    const explanation = result.text.trim();

    if (!explanation) {
      throw new Error("AI 没有返回知识点解释。");
    }

    await db.$transaction([
      db.userKnowledgeNote.upsert({
        where: {
          userId_knowledgeNodeId: {
            userId,
            knowledgeNodeId: node.id
          }
        },
        update: {
          aiExplanation: explanation,
          aiCallId: aiCall.id
        },
        create: {
          userId,
          knowledgeNodeId: node.id,
          note: "",
          aiExplanation: explanation,
          aiCallId: aiCall.id
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

    return { ok: true, data: { explanation, aiCallId: aiCall.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "知识点解释生成失败。";

    await markAiCallFailed(aiCall.id, message, db);

    return { ok: false, error: message };
  }
}

async function resolveKnowledgePreset(db: typeof prisma) {
  return resolveTaskAiPreset(db, AiTaskType.chat_with_context, "text", {
    defaultMaxOutputTokens: 700
  });
}

function buildKnowledgeNodeWhere(goal: NonNullable<PrimaryGoal>): Prisma.KnowledgeNodeWhereInput {
  if (goal.subjectId) {
    return {
      syllabus: {
        subjectId: goal.subjectId
      }
    };
  }

  if (goal.cycleId) {
    return {
      syllabus: {
        subject: {
          cycleId: goal.cycleId
        }
      }
    };
  }

  if (goal.trackId) {
    return {
      syllabus: {
        subject: {
          cycle: {
            trackId: goal.trackId
          }
        }
      }
    };
  }

  return {
    syllabus: {
      subject: {
        cycle: {
          track: {
            programId: goal.programId
          }
        }
      }
    }
  };
}

function collectSubtreeNodeIds(
  rootNodeId: string,
  nodes: Array<{ id: string; parentId: string | null; code: string | null; title: string }>
) {
  const childrenByParent = new Map<string | null, typeof nodes>();

  for (const node of nodes) {
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  for (const children of childrenByParent.values()) {
    children.sort((left, right) => (left.code ?? "").localeCompare(right.code ?? "", "zh-CN") || left.title.localeCompare(right.title, "zh-CN"));
  }

  const ordered: string[] = [];
  visitNode(rootNodeId, childrenByParent, ordered);

  return ordered;
}

function assignKnowledgeTreeMetadata<T extends KnowledgeTreeRecord>(
  item: KnowledgeTreeItem<T>,
  depth: number,
  parentPath: KnowledgeTreePathSegment[]
) {
  item.depth = depth;
  item.path = [...parentPath, { id: item.id, code: item.code, title: item.title }];
  item.directChildCount = item.children.length;
  item.descendantCount = 0;

  for (const child of item.children) {
    assignKnowledgeTreeMetadata(child, depth + 1, item.path);
    item.descendantCount += 1 + child.descendantCount;
  }
}

function formatKnowledgePath(path: KnowledgeTreePathSegment[]) {
  return path.map((segment) => `${segment.code ? `${segment.code} ` : ""}${segment.title}`).join(" / ");
}

function formatPromptSubtree<T extends KnowledgeTreeRecord & { description?: string | null; examExpectation?: string | null }>(root: KnowledgeTreeItem<T>) {
  const rootDepth = root.depth;

  return flattenKnowledgeTree([root]).map((item) => {
    const indent = "  ".repeat(Math.max(0, item.depth - rootDepth));
    const label = `${item.code ? `${item.code} ` : ""}${item.title}`;
    const detail = item.description || item.examExpectation;

    return `${indent}- ${label}${detail ? `：${detail.slice(0, 80)}` : ""}`;
  });
}

function visitNode(
  nodeId: string,
  childrenByParent: Map<string | null, Array<{ id: string; parentId: string | null; code: string | null; title: string }>>,
  ordered: string[]
) {
  ordered.push(nodeId);

  for (const child of childrenByParent.get(nodeId) ?? []) {
    visitNode(child.id, childrenByParent, ordered);
  }
}

function collectQuestionIdsForNodes(nodeIds: string[], directQuestionIdsByNode: Map<string, Set<string>>) {
  const ids = new Set<string>();

  for (const nodeId of nodeIds) {
    for (const questionId of directQuestionIdsByNode.get(nodeId) ?? []) {
      ids.add(questionId);
    }
  }

  return [...ids];
}

function formatSubjectPath(subject: {
  name: string;
  cycle: {
    name: string;
    track: {
      name: string;
      program: {
        name: string;
      };
    };
  };
}) {
  return `${subject.cycle.track.program.name} / ${subject.cycle.track.name} / ${subject.cycle.name} / ${subject.name}`;
}

async function markAiCallFailed(aiCallId: string, errorSummary: string, db: typeof prisma) {
  await db.aiCall.update({
    where: { id: aiCallId },
    data: {
      status: "failed",
      errorSummary
    }
  });
}
