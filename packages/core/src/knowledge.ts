import { AiProvider, AiTaskType, Prisma } from "@prisma/client";
import { assertAiUsageAllowed, generateAiText, resolveAiCredential, type AiTextGenerator } from "./ai";
import { formatGoalPath, getPrimaryExamGoal, type PrimaryGoal } from "./exam-core";
import { prisma } from "./prisma";

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };

export type KnowledgeNodeDetail = {
  id: string;
  parentId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  examExpectation: string | null;
  subjectPath: string;
  accuracy: number;
  recentTotal: number;
  recentCorrect: number;
  pendingWrongNotes: number;
  commonErrors: string[];
  note: {
    note: string;
    aiExplanation: string | null;
    updatedAt: Date;
  } | null;
  relatedQuestions: {
    id: string;
    kind: string;
    stem: string;
    difficulty: number | null;
    recentAnswerCorrect: boolean | null;
  }[];
};

export async function getKnowledgeNode(userId: string, nodeId: string, db = prisma): Promise<KnowledgeNodeDetail | null> {
  const node = await db.knowledgeNode.findFirst({
    where: { id: nodeId.trim() },
    include: {
      syllabus: {
        include: {
          subject: {
            include: {
              cycle: {
                include: {
                  track: {
                    include: { program: true }
                  }
                }
              }
            }
          }
        }
      },
      questionBindings: {
        include: {
          question: true
        },
        take: 20
      },
      userNotes: {
        where: { userId },
        take: 1
      }
    }
  });

  if (!node) return null;

  const questionIds = node.questionBindings.map((b) => b.questionId);
  const recentAnswers = questionIds.length > 0
    ? await db.attemptAnswer.findMany({
        where: {
          attempt: { userId },
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

  const stats = recentAnswers.reduce(
    (acc, answer) => {
      acc.total += 1;
      acc.correct += answer.isCorrect ? 1 : 0;
      return acc;
    },
    { total: 0, correct: 0 }
  );

  const pendingWrong = await db.wrongNote.count({
    where: {
      userId,
      mastered: false,
      questionId: { in: questionIds }
    }
  });

  const wrongNoteQuestions = pendingWrong > 0
    ? await db.wrongNote.findMany({
        where: {
          userId,
          mastered: false,
          questionId: { in: questionIds }
        },
        include: {
          question: {
            include: {
              versions: {
                orderBy: { version: "desc" },
                take: 1
              }
            }
          }
        },
        take: 3
      })
    : [];

  const noteRecord = node.userNotes[0] ?? null;

  return {
    id: node.id,
    parentId: node.parentId,
    code: node.code,
    title: node.title,
    description: node.description,
    examExpectation: node.examExpectation,
    subjectPath: formatSubjectPath(node.syllabus.subject),
    accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
    recentTotal: stats.total,
    recentCorrect: stats.correct,
    pendingWrongNotes: pendingWrong,
    commonErrors: wrongNoteQuestions.map((wn) => wn.question.versions[0]?.stem ?? wn.question.stem),
    note: noteRecord
      ? {
          note: noteRecord.note,
          aiExplanation: noteRecord.aiExplanation,
          updatedAt: noteRecord.updatedAt
        }
      : null,
    relatedQuestions: node.questionBindings.map((binding) => {
      const lastAnswer = answerByQuestion.get(binding.questionId);
      return {
        id: binding.question.id,
        kind: binding.question.kind,
        stem: binding.question.stem.length > 80 ? binding.question.stem.slice(0, 80) + "..." : binding.question.stem,
        difficulty: binding.question.difficulty ?? null,
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

  const [nodes, answers, wrongNotes, notes] = await Promise.all([
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
        questionBindings: {
          select: {
            questionId: true
          }
        }
      },
      orderBy: [{ code: "asc" }, { title: "asc" }]
    }),
    db.attemptAnswer.findMany({
      where: {
        attempt: {
          userId,
          goalId: goal.id
        }
      },
      include: {
        question: {
          include: {
            knowledgeBindings: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 300
    }),
    db.wrongNote.findMany({
      where: {
        userId,
        mastered: false,
        question: {
          knowledgeBindings: {
            some: {
              knowledgeNode: buildKnowledgeNodeWhere(goal)
            }
          }
        }
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
  const stats = new Map<string, { total: number; correct: number }>();
  const pendingWrong = new Map<string, { count: number; errors: string[] }>();

  for (const answer of answers) {
    for (const binding of answer.question.knowledgeBindings) {
      const current = stats.get(binding.knowledgeNodeId) ?? { total: 0, correct: 0 };

      current.total += 1;
      current.correct += answer.isCorrect ? 1 : 0;
      stats.set(binding.knowledgeNodeId, current);
    }
  }

  for (const wrongNote of wrongNotes) {
    const stem = wrongNote.question.versions[0]?.stem ?? wrongNote.question.stem;

    for (const binding of wrongNote.question.knowledgeBindings) {
      const current = pendingWrong.get(binding.knowledgeNodeId) ?? { count: 0, errors: [] };

      current.count += 1;

      if (current.errors.length < 3) {
        current.errors.push(stem);
      }

      pendingWrong.set(binding.knowledgeNodeId, current);
    }
  }

  return {
    status: "ready",
    goal,
    goalPath: formatGoalPath(goal),
    nodes: nodes.map((node) => {
      const nodeStats = stats.get(node.id) ?? { total: 0, correct: 0 };
      const wrong = pendingWrong.get(node.id) ?? { count: 0, errors: [] };
      const note = noteByNode.get(node.id);

      return {
        id: node.id,
        parentId: node.parentId,
        code: node.code,
        title: node.title,
        description: node.description,
        examExpectation: node.examExpectation,
        subjectPath: formatSubjectPath(node.syllabus.subject),
        questionCount: node.questionBindings.length,
        recentTotal: nodeStats.total,
        recentCorrect: nodeStats.correct,
        accuracy: nodeStats.total > 0 ? Math.round((nodeStats.correct / nodeStats.total) * 100) : 0,
        pendingWrongNotes: wrong.count,
        commonErrors: wrong.errors,
        note: note
          ? {
              note: note.note,
              aiExplanation: note.aiExplanation,
              updatedAt: note.updatedAt
            }
          : null
      };
    })
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

  const preset = await resolveKnowledgePreset(db);
  const prompt = {
    instructions: "你是 OpenExam 的知识点讲解助手。只根据给定知识点、大纲要求和用户笔记解释，用简体中文，输出短段落。",
    input: [
      `知识点：${node.code ? `${node.code} ` : ""}${node.title}`,
      `描述：${node.description || "暂无"}`,
      `考试要求：${node.examExpectation || "暂无"}`,
      `用户笔记：${node.userNotes[0]?.note || "暂无"}`,
      "请给出：核心概念、考试常见问法、易错点、一个复习动作。"
    ].join("\n")
  };
  const aiCall = await db.aiCall.create({
    data: {
      userId,
      provider: preset.provider,
      model: preset.model,
      taskType: AiTaskType.chat_with_context,
      promptVersion: "knowledge-node-explain-v1",
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
  const preset = await db.aiProviderPreset.findFirst({
    where: {
      defaultForTask: AiTaskType.chat_with_context,
      enabled: true,
      capabilities: {
        has: "text"
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  return {
    provider: preset?.provider ?? AiProvider.openai,
    model: preset?.model ?? "gpt-5.5",
    maxOutputTokens: preset?.maxTokens ?? 700,
    temperature: preset?.temperature ?? null
  };
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
