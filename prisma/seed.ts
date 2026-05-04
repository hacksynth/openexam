import {
  PrismaClient,
  QuestionKind,
  ReviewStatus,
  SourceType,
  UserRole,
  Visibility
} from "@prisma/client";
import { hashPassword } from "@openexam/core/password";

const prisma = new PrismaClient();

async function main() {
  await seedAdminUser();

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

  await upsertKnowledgeNode({
    syllabusId: basicSyllabus.id,
    code: "DB-NORM-001",
    title: "数据库规范化",
    description: "函数依赖、范式判断和模式分解。",
    examExpectation: "能识别 1NF、2NF、3NF 与 BCNF 的基本条件。"
  });

  await upsertKnowledgeNode({
    syllabusId: basicSyllabus.id,
    code: "UML-MODEL-001",
    title: "UML 建模",
    description: "用例图、类图、顺序图和状态图的基础语义。",
    examExpectation: "能根据题干识别 UML 图元素和关系。"
  });

  await upsertKnowledgeNode({
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

  const stem = "以下哪种记号表示算法运行时间随输入规模线性增长？";
  const existingQuestion = await prisma.question.findFirst({ where: { stem } });
  const question =
    existingQuestion ??
    (await prisma.question.create({
      data: {
        kind: QuestionKind.single_choice,
        stem,
        payload: {
          options: [
            { key: "A", text: "O(1)" },
            { key: "B", text: "O(log n)" },
            { key: "C", text: "O(n)" },
            { key: "D", text: "O(n^2)" }
          ]
        },
        answerKey: { value: "C" },
        explanation: "O(n) 表示运行时间与输入规模成正比。",
        difficulty: 1,
        sourceType: SourceType.original,
        visibility: Visibility.public,
        reviewStatus: ReviewStatus.approved,
        knowledgeBindings: {
          create: {
            knowledgeNodeId: algorithmNode.id,
            weight: 1,
            isPrimary: true
          }
        },
        versions: {
          create: {
            version: 1,
            stem,
            payload: {
              options: [
                { key: "A", text: "O(1)" },
                { key: "B", text: "O(log n)" },
                { key: "C", text: "O(n)" },
                { key: "D", text: "O(n^2)" }
              ]
            },
            answerKey: { value: "C" },
            explanation: "O(n) 表示运行时间与输入规模成正比。",
            sourceType: SourceType.original,
            visibility: Visibility.public,
            reviewStatus: ReviewStatus.approved
          }
        }
      }
    }));

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
  await prisma.paperQuestion.create({
    data: {
      paperId: paper.id,
      questionId: question.id,
      order: 1,
      number: "1",
      section: "基础知识",
      score: 1
    }
  });
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

async function seedAdminUser() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "管理员";

  if (!email && !password) {
    return;
  }

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be provided together.");
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: UserRole.admin,
      passwordHash: await hashPassword(password)
    },
    create: {
      email,
      name,
      role: UserRole.admin,
      passwordHash: await hashPassword(password)
    }
  });
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
