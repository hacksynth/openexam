import { AiProvider, AiTaskType, PrismaClient, QuestionKind, ReviewStatus, SourceType, Visibility } from "@prisma/client";
import { bootstrapAdminUser } from "./admin-user";

const prisma = new PrismaClient();

async function main() {
  await bootstrapAdminUser(prisma);
  await seedAiPresets();

  const program = await prisma.examProgram.upsert({
    where: { slug: "ruankao" },
    update: {
      name: "软考",
      description: "中国计算机技术与软件专业技术资格"
    },
    create: {
      name: "软考",
      slug: "ruankao",
      description: "中国计算机技术与软件专业技术资格"
    }
  });

  const track = await prisma.examTrack.upsert({
    where: { programId_slug: { programId: program.id, slug: "software-designer" } },
    update: {
      name: "软件设计师",
      level: "中级"
    },
    create: {
      programId: program.id,
      name: "软件设计师",
      slug: "software-designer",
      level: "中级"
    }
  });

  const cycle = await prisma.examCycle.upsert({
    where: { trackId_slug: { trackId: track.id, slug: "2026-h1" } },
    update: {
      name: "2026 上半年"
    },
    create: {
      trackId: track.id,
      name: "2026 上半年",
      slug: "2026-h1"
    }
  });

  const basicSubject = await prisma.subject.upsert({
    where: { cycleId_slug: { cycleId: cycle.id, slug: "basic-knowledge" } },
    update: {
      name: "基础知识",
      description: "上午客观题科目"
    },
    create: {
      cycleId: cycle.id,
      name: "基础知识",
      slug: "basic-knowledge",
      description: "上午客观题科目"
    }
  });

  const applicationSubject = await prisma.subject.upsert({
    where: { cycleId_slug: { cycleId: cycle.id, slug: "application-technology" } },
    update: {
      name: "应用技术",
      description: "下午案例分析科目"
    },
    create: {
      cycleId: cycle.id,
      name: "应用技术",
      slug: "application-technology",
      description: "下午案例分析科目"
    }
  });

  const basicSyllabus = await prisma.syllabus.upsert({
    where: { subjectId_version: { subjectId: basicSubject.id, version: "mvp" } },
    update: {
      name: "软件设计师基础知识 MVP 大纲"
    },
    create: {
      subjectId: basicSubject.id,
      name: "软件设计师基础知识 MVP 大纲",
      version: "mvp"
    }
  });

  const applicationSyllabus = await prisma.syllabus.upsert({
    where: { subjectId_version: { subjectId: applicationSubject.id, version: "mvp" } },
    update: {
      name: "软件设计师应用技术 MVP 大纲"
    },
    create: {
      subjectId: applicationSubject.id,
      name: "软件设计师应用技术 MVP 大纲",
      version: "mvp"
    }
  });

  const algorithmNode = await upsertKnowledgeNode({
    syllabusId: basicSyllabus.id,
    code: "DS-ALGO-001",
    title: "算法复杂度",
    description: "常见算法的时间复杂度与空间复杂度分析。",
    examExpectation: "能判断 O(1)、O(log n)、O(n)、O(n^2) 等复杂度。"
  });

  const dbNormNode = await upsertKnowledgeNode({
    syllabusId: basicSyllabus.id,
    code: "DB-NORM-001",
    title: "数据库规范化",
    description: "函数依赖、范式判断和模式分解。",
    examExpectation: "能识别 1NF、2NF、3NF 与 BCNF 的基本条件。"
  });

  const umlNode = await upsertKnowledgeNode({
    syllabusId: basicSyllabus.id,
    code: "UML-MODEL-001",
    title: "UML 建模",
    description: "用例图、类图、顺序图和状态图的基础语义。",
    examExpectation: "能根据题干识别 UML 图元素和关系。"
  });

  const securityNode = await upsertKnowledgeNode({
    syllabusId: basicSyllabus.id,
    code: "SEC-BASIC-001",
    title: "网络安全基础",
    description: "加密、认证、访问控制和常见安全风险。",
    examExpectation: "能区分对称加密、非对称加密、摘要和数字签名。"
  });

  await upsertKnowledgeNode({
    syllabusId: basicSyllabus.id,
    code: "TEST-STRATEGY-001",
    title: "软件测试策略",
    description: "黑盒测试、白盒测试、覆盖准则和测试阶段。",
    examExpectation: "能判断测试方法、覆盖标准和测试用例设计思路。"
  });

  await upsertKnowledgeNode({
    syllabusId: applicationSyllabus.id,
    code: "CASE-ANALYSIS-001",
    title: "案例分析表达",
    description: "软件设计师下午题中的需求分析、设计说明和计算表达。",
    examExpectation: "能按题目上下文组织答案并给出关键推理过程。"
  });

  const questions = await Promise.all([
    seedSingleChoiceQuestion({
      knowledgeNodeId: algorithmNode.id,
      stem: "以下哪种记号表示算法运行时间随输入规模线性增长？",
      legacyStems: ["Which notation describes an algorithm whose running time grows linearly with input size?"],
      options: [
        { key: "A", text: "O(1)" },
        { key: "B", text: "O(log n)" },
        { key: "C", text: "O(n)" },
        { key: "D", text: "O(n^2)" }
      ],
      answer: "C",
      explanation: "O(n) 表示运行时间与输入规模成正比。",
      difficulty: 1
    }),
    seedSingleChoiceQuestion({
      knowledgeNodeId: dbNormNode.id,
      stem: "关系模式满足 2NF 的前提是它已经满足哪一个范式？",
      options: [
        { key: "A", text: "1NF" },
        { key: "B", text: "3NF" },
        { key: "C", text: "BCNF" },
        { key: "D", text: "4NF" }
      ],
      answer: "A",
      explanation: "第二范式要求在第一范式基础上消除非主属性对码的部分函数依赖。",
      difficulty: 2
    }),
    seedSingleChoiceQuestion({
      knowledgeNodeId: umlNode.id,
      stem: "UML 用例图主要用于描述系统与哪类对象之间的交互？",
      options: [
        { key: "A", text: "数据库表" },
        { key: "B", text: "参与者" },
        { key: "C", text: "源代码文件" },
        { key: "D", text: "部署节点" }
      ],
      answer: "B",
      explanation: "用例图描述参与者与系统提供的用例之间的关系。",
      difficulty: 1
    }),
    seedSingleChoiceQuestion({
      knowledgeNodeId: securityNode.id,
      stem: "数字签名主要用于保证消息的完整性和哪一项安全目标？",
      options: [
        { key: "A", text: "不可否认性" },
        { key: "B", text: "匿名性" },
        { key: "C", text: "可压缩性" },
        { key: "D", text: "负载均衡" }
      ],
      answer: "A",
      explanation: "数字签名可验证发送者身份，并提供完整性与不可否认性。",
      difficulty: 2
    })
  ]);

  const paper = await prisma.paper.upsert({
    where: { slug: "ruankao-software-designer-basic-sample" },
    update: {
      cycleId: cycle.id,
      subjectId: basicSubject.id,
      title: "软考软件设计师基础知识样例卷",
      paperType: "sample",
      visibility: Visibility.public
    },
    create: {
      cycleId: cycle.id,
      subjectId: basicSubject.id,
      title: "软考软件设计师基础知识样例卷",
      slug: "ruankao-software-designer-basic-sample",
      paperType: "sample",
      visibility: Visibility.public
    }
  });

  await prisma.paperQuestion.deleteMany({ where: { paperId: paper.id } });
  await prisma.paperQuestion.createMany({
    data: questions.map((question, index) => ({
      paperId: paper.id,
      questionId: question.id,
      order: index + 1,
      number: String(index + 1),
      section: "基础知识",
      score: 1
    }))
  });
}

async function seedAiPresets() {
  const preset = await prisma.aiProviderPreset.upsert({
    where: {
      provider_model: {
        provider: AiProvider.openai,
        model: "gpt-5.5"
      }
    },
    update: {
      label: "OpenAI GPT-5.5",
      capabilities: ["text", "json", "vision", "document"],
      maxTokens: 8192,
      enabled: true
    },
    create: {
      provider: AiProvider.openai,
      model: "gpt-5.5",
      label: "OpenAI GPT-5.5",
      capabilities: ["text", "json", "vision", "document"],
      maxTokens: 8192,
      enabled: true
    }
  });

  const defaultTasks = Object.values(AiTaskType).filter((taskType) => taskType !== AiTaskType.generate_image);

  for (const taskType of defaultTasks) {
    await prisma.aiProviderPresetTask.upsert({
      where: { taskType },
      update: {},
      create: {
        presetId: preset.id,
        taskType
      }
    });
  }
}

async function upsertKnowledgeNode(input: {
  syllabusId: string;
  code: string;
  title: string;
  description: string;
  examExpectation: string;
}) {
  const existing = await prisma.knowledgeNode.findFirst({
    where: { syllabusId: input.syllabusId, code: input.code }
  });

  if (existing) {
    return prisma.knowledgeNode.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        description: input.description,
        examExpectation: input.examExpectation
      }
    });
  }

  return prisma.knowledgeNode.create({
    data: input
  });
}

async function seedSingleChoiceQuestion(input: {
  knowledgeNodeId: string;
  stem: string;
  legacyStems?: string[];
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
  difficulty: number;
}) {
  const payload = { options: input.options };
  const answerKey = { value: input.answer };
  const questionData = {
    kind: QuestionKind.single_choice,
    stem: input.stem,
    payload,
    answerKey,
    explanation: input.explanation,
    difficulty: input.difficulty,
    sourceType: SourceType.original,
    visibility: Visibility.public,
    reviewStatus: ReviewStatus.approved,
    deletedAt: null
  };
  const legacyStems = input.legacyStems ?? [];
  const canonicalQuestion = await prisma.question.findFirst({ where: { stem: input.stem } });
  const legacyQuestions =
    legacyStems.length > 0
      ? await prisma.question.findMany({
          where: {
            stem: {
              in: legacyStems
            }
          }
        })
      : [];
  const existing = canonicalQuestion ?? legacyQuestions[0] ?? null;

  if (canonicalQuestion && legacyQuestions.length > 0) {
    await prisma.question.updateMany({
      where: {
        id: {
          in: legacyQuestions.map((question) => question.id)
        }
      },
      data: {
        visibility: Visibility.private,
        reviewStatus: ReviewStatus.draft,
        deletedAt: new Date()
      }
    });
  }

  const question = existing
    ? await prisma.question.update({
        where: { id: existing.id },
        data: questionData
      })
    : await prisma.question.create({
        data: questionData
      });

  await prisma.questionKnowledgeNode.deleteMany({ where: { questionId: question.id } });
  await prisma.questionKnowledgeNode.create({
    data: {
      questionId: question.id,
      knowledgeNodeId: input.knowledgeNodeId,
      weight: 1,
      isPrimary: true
    }
  });

  await prisma.questionVersion.upsert({
    where: {
      questionId_version: {
        questionId: question.id,
        version: question.currentVersion
      }
    },
    update: {
      stem: input.stem,
      payload,
      answerKey,
      explanation: input.explanation,
      sourceType: SourceType.original,
      visibility: Visibility.public,
      reviewStatus: ReviewStatus.approved
    },
    create: {
      questionId: question.id,
      version: question.currentVersion,
      stem: input.stem,
      payload,
      answerKey,
      explanation: input.explanation,
      sourceType: SourceType.original,
      visibility: Visibility.public,
      reviewStatus: ReviewStatus.approved
    }
  });

  return question;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
