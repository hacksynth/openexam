import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "@openexam/core/password";

process.env.DATABASE_URL ??= "postgresql://openexam:openexam@localhost:5432/openexam?schema=public";

const prisma = new PrismaClient();
const webUrl = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const adminUrl = process.env.E2E_ADMIN_URL ?? "http://127.0.0.1:3001";
const adminEmail = "e2e.admin@openexam.local";
const adminPassword = "admin1234";
const learnerEmail = "e2e.learner@openexam.local";
const learnerPassword = "learner1234";
const questionStem = "E2E 单选题：事务原子性最准确的含义是什么？";
const paperTitle = "E2E 基础知识样例卷";
const paperSlug = "e2e-paper-basic-sample";

let fixtureIds: {
  programId: string;
  trackId: string;
  cycleId: string;
  subjectId: string;
  knowledgeNodeId: string;
};

test.describe.serial("OpenExam auth, question, paper, and wrong-note flows", () => {
  test.beforeAll(async () => {
    await cleanupE2eData();
    fixtureIds = await seedExamHierarchy();
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        name: "E2E 管理员",
        role: UserRole.admin,
        passwordHash: await hashPassword(adminPassword)
      },
      create: {
        email: adminEmail,
        name: "E2E 管理员",
        role: UserRole.admin,
        passwordHash: await hashPassword(adminPassword)
      }
    });
  });

  test.afterAll(async () => {
    await cleanupE2eData();
    await prisma.$disconnect();
  });

  test("creates content in admin, completes a paper in web, and blocks non-admin access", async ({ browser }) => {
    const adminPage = await newPage(browser);
    await loginAdmin(adminPage);
    await createQuestion(adminPage);
    await createPaper(adminPage);

    const webPage = await newPage(browser);
    await registerLearner(webPage);
    await saveGoal(webPage);
    await completePaperWithWrongAnswer(webPage);
    await retryWrongNoteCorrectly(webPage);
    await rejectLearnerFromAdmin(browser);
  });
});

async function newPage(browser: Browser) {
  const context = await browser.newContext();

  return context.newPage();
}

async function loginAdmin(page: Page) {
  await page.goto(`${adminUrl}/login`);
  await page.getByLabel("邮箱").fill(adminEmail);
  await page.getByLabel("密码").fill(adminPassword);
  await page.getByRole("button", { name: "登录管理端" }).click();
  await expect(page.getByRole("heading", { name: "管理台" })).toBeVisible();
}

async function createQuestion(page: Page) {
  await page.goto(`${adminUrl}/questions`);
  const form = page.locator('form:has(button:has-text("新增题目"))').first();

  await form.locator('textarea[name="stem"]').fill(questionStem);
  await form.locator('input[name="optionA"]').fill("事务中的所有操作要么全部成功，要么全部失败。");
  await form.locator('input[name="optionB"]').fill("事务可以被多个用户同时修改。");
  await form.locator('input[name="optionC"]').fill("事务提交后可以任意回滚。");
  await form.locator('input[name="optionD"]').fill("事务只保证查询速度。");
  await form.locator('select[name="answer"]').selectOption("A");
  await form.locator('input[name="difficulty"]').fill("2");
  await form.locator('select[name="visibility"]').selectOption("public");
  await form.locator('select[name="reviewStatus"]').selectOption("approved");
  await form.locator('select[name="sourceType"]').selectOption("original");
  await form.locator('select[name="knowledgeNodeId"]').selectOption(fixtureIds.knowledgeNodeId);
  await form.locator('textarea[name="explanation"]').fill("原子性要求事务作为不可分割的工作单元执行。");
  await form.getByRole("button", { name: "新增题目" }).click();
  await expect(page.getByText("题目已创建。")).toBeVisible();
  await expect(page.locator("body")).toContainText(questionStem);
}

async function createPaper(page: Page) {
  await page.goto(`${adminUrl}/papers`);
  const form = page.locator('form:has(button:has-text("新增试卷"))').first();

  await form.locator('input[name="title"]').fill(paperTitle);
  await form.locator('input[name="slug"]').fill(paperSlug);
  await form.locator('select[name="paperType"]').selectOption("sample");
  await form.locator('select[name="visibility"]').selectOption("public");
  await form.locator('select[name="subjectId"]').selectOption(fixtureIds.subjectId);

  const questionRow = form.locator("section").filter({ hasText: questionStem }).last();
  await questionRow.getByRole("checkbox").check();
  await questionRow.locator(`input[name="order_${await questionRow.getByRole("checkbox").inputValue()}"]`).fill("1");
  await questionRow.locator(`input[name="number_${await questionRow.getByRole("checkbox").inputValue()}"]`).fill("1");
  await questionRow.locator(`input[name="section_${await questionRow.getByRole("checkbox").inputValue()}"]`).fill("基础知识");
  await questionRow.locator(`input[name="score_${await questionRow.getByRole("checkbox").inputValue()}"]`).fill("1");

  await form.getByRole("button", { name: "新增试卷" }).click();
  await expect(page.getByText("试卷已创建。")).toBeVisible();
  await expect(page.locator("body")).toContainText(paperTitle);
}

async function registerLearner(page: Page) {
  await page.goto(`${webUrl}/register`);
  await page.getByLabel("昵称").fill("E2E 学员");
  await page.getByLabel("邮箱").fill(learnerEmail);
  await page.getByLabel("密码").fill(learnerPassword);
  await page.getByRole("button", { name: "注册并进入学习端" }).click();
  await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
}

async function saveGoal(page: Page) {
  await page.goto(`${webUrl}/goals`);
  await page.locator('select[name="programId"]').selectOption(fixtureIds.programId);
  await page.locator('select[name="trackId"]').selectOption(fixtureIds.trackId);
  await page.locator('select[name="cycleId"]').selectOption(fixtureIds.cycleId);
  await page.locator('select[name="subjectId"]').selectOption(fixtureIds.subjectId);
  await page.locator('input[name="dailyMinutes"]').fill("45");
  await page.getByRole("button", { name: "保存主目标" }).click();
  await expect(page.getByText("考试目标已保存。")).toBeVisible();
}

async function completePaperWithWrongAnswer(page: Page) {
  await page.goto(`${webUrl}/papers`);
  const paperCard = page.locator("article").filter({ hasText: paperTitle }).first();

  await paperCard.getByRole("link", { name: "开始作答" }).click();
  await expect(page.locator("body")).toContainText(questionStem);
  await page.locator('input[type="radio"][value="B"]').check();
  await page.getByRole("button", { name: "提交试卷" }).click();
  await expect(page.getByText("试卷已提交，得分 0 / 1。")).toBeVisible();
  await expect(page.locator("body")).toContainText(paperTitle);
  await expect(page.locator("body")).toContainText(questionStem);
}

async function retryWrongNoteCorrectly(page: Page) {
  await page.goto(`${webUrl}/wrong-notes`);
  await expect(page.locator("body")).toContainText(questionStem);
  await page.locator("section").filter({ hasText: questionStem }).first().getByRole("link", { name: "重练此题" }).click();
  await expect(page.locator("body")).toContainText(questionStem);
  await page.locator('input[name="answer"][value="A"]').check();
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("回答正确")).toBeVisible();
}

async function rejectLearnerFromAdmin(browser: Browser) {
  const page = await newPage(browser);

  await page.goto(`${adminUrl}/login`);
  await page.getByLabel("邮箱").fill(learnerEmail);
  await page.getByLabel("密码").fill(learnerPassword);
  await page.getByRole("button", { name: "登录管理端" }).click();
  await expect(page.getByText("该账号没有管理端权限。")).toBeVisible();
}

async function seedExamHierarchy() {
  const program = await prisma.examProgram.upsert({
    where: { slug: "e2e-ruankao" },
    update: { name: "E2E 软考", description: "E2E 专用考试项目" },
    create: { slug: "e2e-ruankao", name: "E2E 软考", description: "E2E 专用考试项目" }
  });
  const track = await prisma.examTrack.upsert({
    where: { programId_slug: { programId: program.id, slug: "software-designer" } },
    update: { name: "软件设计师", level: "中级" },
    create: { programId: program.id, slug: "software-designer", name: "软件设计师", level: "中级" }
  });
  const cycle = await prisma.examCycle.upsert({
    where: { trackId_slug: { trackId: track.id, slug: "2026-h1" } },
    update: { name: "2026 上半年" },
    create: { trackId: track.id, slug: "2026-h1", name: "2026 上半年" }
  });
  const subject = await prisma.subject.upsert({
    where: { cycleId_slug: { cycleId: cycle.id, slug: "basic-knowledge" } },
    update: { name: "基础知识", description: "E2E 基础知识科目" },
    create: { cycleId: cycle.id, slug: "basic-knowledge", name: "基础知识", description: "E2E 基础知识科目" }
  });
  const syllabus = await prisma.syllabus.upsert({
    where: { subjectId_version: { subjectId: subject.id, version: "e2e" } },
    update: { name: "E2E 大纲" },
    create: { subjectId: subject.id, version: "e2e", name: "E2E 大纲" }
  });
  const existingNode = await prisma.knowledgeNode.findFirst({
    where: {
      syllabusId: syllabus.id,
      code: "E2E-DB-001"
    }
  });
  const knowledgeNode =
    existingNode ??
    (await prisma.knowledgeNode.create({
      data: {
        syllabusId: syllabus.id,
        code: "E2E-DB-001",
        title: "事务基础",
        description: "事务 ACID 特性。",
        examExpectation: "能判断原子性、一致性、隔离性和持久性。"
      }
    }));

  return {
    programId: program.id,
    trackId: track.id,
    cycleId: cycle.id,
    subjectId: subject.id,
    knowledgeNodeId: knowledgeNode.id
  };
}

async function cleanupE2eData() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        endsWith: "@openexam.local"
      }
    },
    select: { id: true }
  });
  const userIds = users.map((user) => user.id);
  const questions = await prisma.question.findMany({
    where: {
      stem: {
        startsWith: "E2E 单选题"
      }
    },
    select: { id: true }
  });
  const questionIds = questions.map((question) => question.id);
  const papers = await prisma.paper.findMany({
    where: {
      slug: {
        startsWith: "e2e-paper-"
      }
    },
    select: { id: true }
  });
  const paperIds = papers.map((paper) => paper.id);
  const attempts =
    userIds.length > 0
      ? await prisma.attempt.findMany({
          where: {
            userId: {
              in: userIds
            }
          },
          select: { id: true }
        })
      : [];
  const attemptIds = attempts.map((attempt) => attempt.id);

  if (userIds.length > 0 || questionIds.length > 0) {
    await prisma.wrongNote.deleteMany({
      where: {
        OR: [
          ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
          ...(questionIds.length > 0 ? [{ questionId: { in: questionIds } }] : [])
        ]
      }
    });
  }

  if (attemptIds.length > 0 || questionIds.length > 0) {
    await prisma.attemptAnswer.deleteMany({
      where: {
        OR: [
          ...(attemptIds.length > 0 ? [{ attemptId: { in: attemptIds } }] : []),
          ...(questionIds.length > 0 ? [{ questionId: { in: questionIds } }] : [])
        ]
      }
    });
  }

  if (attemptIds.length > 0) {
    await prisma.attempt.deleteMany({ where: { id: { in: attemptIds } } });
  }

  if (userIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.examGoal.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (paperIds.length > 0 || questionIds.length > 0) {
    await prisma.paperQuestion.deleteMany({
      where: {
        OR: [
          ...(paperIds.length > 0 ? [{ paperId: { in: paperIds } }] : []),
          ...(questionIds.length > 0 ? [{ questionId: { in: questionIds } }] : [])
        ]
      }
    });
  }

  if (paperIds.length > 0) {
    await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
  }

  if (questionIds.length > 0) {
    await prisma.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.questionKnowledgeNode.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  }
}
