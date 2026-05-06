import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "@openexam/core/password";

process.env.DATABASE_URL ??= "postgresql://openexam:openexam@localhost:5432/openexam?schema=public";
process.env.AI_KEY_ENCRYPTION_SECRET = "openexam-e2e-ai-key-secret";
process.env.OPENAI_BASE_URL = "http://127.0.0.1:8317/v1";

const prisma = new PrismaClient();
const webUrl = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const adminUrl = process.env.E2E_ADMIN_URL ?? `${webUrl}/admin`;
const adminEmail = "e2e.admin@openexam.local";
const adminPassword = "admin1234";
const learnerEmail = "e2e.learner@openexam.local";
const learnerPassword = "learner1234";
const questionStem = "E2E 单选题：事务原子性最准确的含义是什么？";
const importedQuestionStem = "E2E 单选题：隔离性用于解决什么问题？";
const extractedQuestionStem = "E2E 资料抽题：事务原子性最准确的含义是什么？";
const paperTitle = "E2E 基础知识样例卷";
const paperSlug = "e2e-paper-basic-sample";
const aiPresetModel = "gpt-5.4-e2e";
const materialTitle = "E2E 事务资料";

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
    await resetOpenAiMock();
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

  test("admin creates a public single-choice question", async ({ browser }) => {
    const adminPage = await newPage(browser);
    await loginAdmin(adminPage);
    await createQuestion(adminPage);
  });

  test("admin imports single-choice questions from JSON", async ({ browser }) => {
    const adminPage = await newPage(browser);
    await loginAdmin(adminPage);
    await importQuestion(adminPage);
  });

  test("admin creates a public paper", async ({ browser }) => {
    const adminPage = await newPage(browser);
    await loginAdmin(adminPage);
    await createPaper(adminPage);
  });

  test("admin configures an AI model preset", async ({ browser }) => {
    const adminPage = await newPage(browser);
    await loginAdmin(adminPage);
    await configureAdminAiPreset(adminPage);
  });

  test("learner registers and saves a goal", async ({ browser }) => {
    const webPage = await newPage(browser);
    await registerLearner(webPage);
    await saveGoal(webPage);
  });

  test("learner confirms unanswered submission and gets a report", async ({ browser }) => {
    const webPage = await newPage(browser);
    await loginLearner(webPage);
    await completePaperWithWrongAnswer(webPage);
  });

  test("learner configures BYOK and generates wrong-note AI analysis", async ({ browser }) => {
    const webPage = await newPage(browser);
    await loginLearner(webPage);
    await configureByokAndGenerateWrongNoteAnalysis(webPage);
  });

  test("learner queues a wrong-note review card image", async ({ browser }) => {
    const webPage = await newPage(browser);
    await loginLearner(webPage);
    await generateWrongNoteReviewCard(webPage);
  });

  test("failed review-card image jobs appear and can be retried by admin", async ({ browser }) => {
    const webPage = await newPage(browser);
    const adminPage = await newPage(browser);

    await loginLearner(webPage);
    await loginAdmin(adminPage);
    await failAndRetryWrongNoteReviewCard(webPage, adminPage);
  });

  test("learner retries the wrong note", async ({ browser }) => {
    const webPage = await newPage(browser);
    await loginLearner(webPage);
    await retryWrongNoteCorrectly(webPage);
  });

  test("learner uploads material and admin confirms extracted question", async ({ browser }) => {
    const webPage = await newPage(browser);
    const adminPage = await newPage(browser);

    await loginLearner(webPage);
    await uploadMaterial(webPage);
    await loginAdmin(adminPage);
    await processMaterialJobAndConfirmQuestion(adminPage);
    await practiceConfirmedMaterialQuestion(webPage);
  });

  test("learner reviews analysis and generates a study plan", async ({ browser }) => {
    const webPage = await newPage(browser);

    await loginLearner(webPage);
    await reviewAnalysisAndGeneratePlan(webPage);
  });

  test("admin hides and restores a paper", async ({ browser }) => {
    const adminPage = await newPage(browser);
    const webPage = await newPage(browser);

    await loginAdmin(adminPage);
    await loginLearner(webPage);
    await hideAndRestorePaper(adminPage, webPage);
  });

  test("admin rejects non-admin learner login", async ({ browser }) => {
    await rejectLearnerFromAdmin(browser);
  });
});

async function newPage(browser: Browser) {
  const context = await browser.newContext();

  return context.newPage();
}

async function resetOpenAiMock() {
  await fetch("http://127.0.0.1:8317/reset", { method: "POST" }).catch(() => undefined);
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
  await choosePixelSelect(form, "answer", "A");
  await form.locator('input[name="difficulty"]').fill("2");
  await choosePixelSelect(form, "visibility", "public");
  await choosePixelSelect(form, "reviewStatus", "approved");
  await choosePixelSelect(form, "sourceType", "original");
  await choosePixelSelect(form, "knowledgeNodeId", fixtureIds.knowledgeNodeId);
  await form.locator('textarea[name="explanation"]').fill("原子性要求事务作为不可分割的工作单元执行。");
  await form.getByRole("button", { name: "新增题目" }).click();
  await expect(page.getByText("题目已创建。")).toBeVisible();
  await expect(page.locator("body")).toContainText(questionStem);
}

async function importQuestion(page: Page) {
  await page.goto(`${adminUrl}/questions`);
  const form = page.locator('form:has(button:has-text("导入题目"))').first();
  const payload = [
    {
      stem: importedQuestionStem,
      optionA: "隔离性用于控制并发事务之间的相互影响。",
      optionB: "隔离性用于保证断电后数据不丢失。",
      optionC: "隔离性用于保证事务全部成功或全部失败。",
      optionD: "隔离性用于压缩数据库日志。",
      answer: "A",
      explanation: "隔离性关注并发事务之间的可见性和干扰控制。",
      difficulty: 3,
      knowledgeNodeId: fixtureIds.knowledgeNodeId,
      visibility: "public",
      sourceType: "original",
      reviewStatus: "approved"
    }
  ];

  await form.locator('textarea[name="jsonPayload"]').fill(JSON.stringify(payload));
  await form.getByRole("button", { name: "导入题目" }).click();
  await expect(page.getByText("已导入 1 道题。")).toBeVisible();
  await expect(page.locator("body")).toContainText(importedQuestionStem);
}

async function createPaper(page: Page) {
  await page.goto(`${adminUrl}/papers`);
  const form = page.locator('form:has(button:has-text("新增试卷"))').first();

  await form.locator('input[name="title"]').fill(paperTitle);
  await form.locator('input[name="slug"]').fill(paperSlug);
  await choosePixelSelect(form, "paperType", "sample");
  await choosePixelSelect(form, "visibility", "public");
  await choosePixelSelect(form, "subjectId", fixtureIds.subjectId);

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

async function loginLearner(page: Page) {
  await page.goto(`${webUrl}/login`);
  await page.getByLabel("邮箱").fill(learnerEmail);
  await page.getByLabel("密码").fill(learnerPassword);
  await page.getByRole("button", { name: "登录学习端" }).click();
  await expect(page.getByRole("heading", { name: "仪表盘" })).toBeVisible();
}

async function saveGoal(page: Page) {
  await page.goto(`${webUrl}/goals`);
  await choosePixelSelect(page, "programId", fixtureIds.programId);
  await choosePixelSelect(page, "trackId", fixtureIds.trackId);
  await choosePixelSelect(page, "cycleId", fixtureIds.cycleId);
  await choosePixelSelect(page, "subjectId", fixtureIds.subjectId);
  await page.locator('input[name="targetDate"]').evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, futureDateInput(45));
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
  await page.getByRole("button", { name: "提交试卷" }).first().click();
  await expect(page).toHaveURL(/\/attempts\/[^/?]+/);
  await expect(page.getByRole("heading", { name: "作答报告" })).toBeVisible();
  await expect(page.getByText("试卷已提交，得分 0 / 1。")).toBeVisible();
  await expect(page.locator("body")).toContainText(paperTitle);
  await expect(page.locator("body")).toContainText(questionStem);
  await expect(page.locator("body")).toContainText("正确率");
}

async function retryWrongNoteCorrectly(page: Page) {
  await page.goto(`${webUrl}/wrong-notes?knowledgeNodeId=${fixtureIds.knowledgeNodeId}`);
  await expect(page.locator("body")).toContainText(questionStem);
  await page.locator("section").filter({ hasText: questionStem }).first().getByRole("link", { name: "重练此题" }).click();
  await expect(page.locator("body")).toContainText(questionStem);
  await page.locator('input[name="answer"][value="A"]').check();
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("回答正确")).toBeVisible();
  await page.goto(`${webUrl}/wrong-notes?filter=mastered&knowledgeNodeId=${fixtureIds.knowledgeNodeId}`);
  await expect(page.locator("body")).toContainText(questionStem);
  await expect(page.locator("section").filter({ hasText: questionStem }).first()).toContainText("已掌握");
}

async function configureByokAndGenerateWrongNoteAnalysis(page: Page) {
  await page.goto(`${webUrl}/profile`);
  await page.getByLabel("API Key").fill("sk-e2e-openai-test-key");
  await page.getByRole("button", { name: "保存 Key" }).click();
  await expect(page.getByText("OpenAI API Key 已保存。")).toBeVisible();
  await expect(page.locator("body")).toContainText("已配置");

  await page.goto(`${webUrl}/wrong-notes?knowledgeNodeId=${fixtureIds.knowledgeNodeId}`);
  await page.locator("section").filter({ hasText: questionStem }).first().getByRole("button", { name: "生成 AI 解析" }).click();
  await expect(page.getByText("AI 解析已生成。")).toBeVisible();
  await expect(page.locator("body")).toContainText("AI E2E 解析");

  await page.goto(`${webUrl}/ai/tasks`);
  await expect(page.getByRole("heading", { name: "AI 任务" })).toBeVisible();
  await expect(page.locator("body")).toContainText("题目解析");
  await expect(page.locator("body")).toContainText("成功");
  await expect(page.locator("body")).toContainText(aiPresetModel);

  await page.goto(`${webUrl}/profile`);
  await page.getByLabel("API Key").fill("sk-e2e-openai-fail-once");
  await page.getByRole("button", { name: "保存 Key" }).click();
  await expect(page.getByText("OpenAI API Key 已保存。")).toBeVisible();

  await page.goto(`${webUrl}/wrong-notes?knowledgeNodeId=${fixtureIds.knowledgeNodeId}`);
  await page.locator("section").filter({ hasText: questionStem }).first().getByRole("button", { name: "重新生成 AI 解析" }).click();
  await expect(page.getByText(/Mock OpenAI failure/)).toBeVisible();

  await page.goto(`${webUrl}/ai/tasks`);
  await expect(page.locator("body")).toContainText("失败");
  await expect(page.locator("body")).toContainText("Mock OpenAI failure");
  await page.locator("article").filter({ hasText: "Mock OpenAI failure" }).first().getByRole("button", { name: "重试" }).click();
  await expect(page.getByText("错题 AI 解析已重试成功。")).toBeVisible();
  await expect(page.locator("body")).toContainText("成功");
  await expect(page.locator("body")).toContainText(aiPresetModel);

  await saveLearnerOpenAiKey(page, "sk-e2e-openai-test-key");
}

async function generateWrongNoteReviewCard(page: Page) {
  await saveLearnerOpenAiKey(page, "sk-e2e-openai-test-key");
  await page.goto(`${webUrl}/wrong-notes?knowledgeNodeId=${fixtureIds.knowledgeNodeId}`);
  await wrongNoteArticle(page).getByRole("button", { name: "生成复习卡" }).click();
  await expect(page.getByText("复习卡图片任务已加入队列。")).toBeVisible();
  await processLatestReviewCardJobForE2e();
  await waitForWrongNoteReviewCard(page, "成功");
  await expect(wrongNoteArticle(page).getByAltText("错题复习卡")).toBeVisible();
}

async function failAndRetryWrongNoteReviewCard(webPage: Page, adminPage: Page) {
  await saveLearnerOpenAiKey(webPage, "sk-e2e-openai-fail-once");
  await webPage.goto(`${webUrl}/wrong-notes?knowledgeNodeId=${fixtureIds.knowledgeNodeId}`);
  await wrongNoteArticle(webPage).getByRole("button", { name: "重新生成复习卡" }).click();
  await expect(webPage.getByText("复习卡图片任务已加入队列。")).toBeVisible();
  await processLatestReviewCardJobForE2e({ allowFailure: true });
  await waitForWrongNoteReviewCard(webPage, "Mock OpenAI image failure");

  await adminPage.goto(`${adminUrl}/jobs?status=failed`);
  await expect(adminPage.locator("body")).toContainText("Mock OpenAI image failure");
  const failedJob = adminPage.locator("article").filter({ hasText: "Mock OpenAI image failure" }).first();

  await expect(failedJob).toContainText("Payload");
  await expect(failedJob).toContainText("wrongNoteId");
  await failedJob.getByRole("button", { name: "重试" }).click();
  await expect(adminPage.getByText("任务已重试。")).toBeVisible();

  await waitForWrongNoteReviewCard(webPage, "成功");
  await expect(wrongNoteArticle(webPage).getByAltText("错题复习卡")).toBeVisible();
  await saveLearnerOpenAiKey(webPage, "sk-e2e-openai-test-key");
}

async function saveLearnerOpenAiKey(page: Page, apiKey: string) {
  await page.goto(`${webUrl}/profile`);
  await page.getByLabel("API Key").fill(apiKey);
  await page.getByRole("button", { name: "保存 Key" }).click();
  await expect(page.getByText("OpenAI API Key 已保存。")).toBeVisible();
}

async function waitForWrongNoteReviewCard(page: Page, expectedText: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await page.goto(`${webUrl}/wrong-notes?knowledgeNodeId=${fixtureIds.knowledgeNodeId}`);
    const card = wrongNoteArticle(page);
    const matched =
      expectedText === "成功"
        ? await card.getByAltText("错题复习卡").isVisible().catch(() => false)
        : await card.getByText(expectedText).first().isVisible().catch(() => false);

    if (matched) {
      return;
    }

    await page.waitForTimeout(500);
  }

  if (expectedText === "成功") {
    await expect(wrongNoteArticle(page).getByAltText("错题复习卡")).toBeVisible();
  } else {
    await expect(wrongNoteArticle(page).getByText(expectedText).first()).toBeVisible();
  }
}

async function processLatestReviewCardJobForE2e(options: { allowFailure?: boolean } = {}) {
  const { processJob } = await import("@openexam/core/jobs");
  const learner = await prisma.user.findUnique({
    where: {
      email: learnerEmail
    },
    select: {
      id: true
    }
  });

  if (!learner) {
    throw new Error("E2E learner was not created.");
  }

  const job = await prisma.job.findFirst({
    where: {
      userId: learner.id,
      type: "generate_wrong_note_review_card"
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (!job) {
    throw new Error("E2E review-card job was not created.");
  }

  if (job.status === "succeeded") {
    return;
  }

  const result = await processJob(job.id);

  if (result.ok || (options.allowFailure && result.error.includes("Mock OpenAI image failure"))) {
    return;
  }

  throw new Error(result.error);
}

function wrongNoteArticle(page: Page) {
  return page.locator("article").filter({ hasText: questionStem }).first();
}

async function uploadMaterial(page: Page) {
  await page.goto(`${webUrl}/materials`);
  await page.locator('input[name="title"]').fill(materialTitle);
  await page.locator('input[name="sourceLicense"]').fill("E2E 原创");
  await choosePixelSelect(page, "subjectId", fixtureIds.subjectId);
  await page.locator('input[name="file"]').setInputFiles({
    name: "e2e-transaction.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("事务原子性表示事务中的所有操作要么全部成功，要么全部失败。隔离性用于控制并发事务之间的相互影响。", "utf8")
  });
  await page.getByRole("button", { name: "上传并创建抽题任务" }).click();
  await expect(page.getByText("资料已上传，抽题任务已进入队列。")).toBeVisible();
  await expect(page.locator("body")).toContainText(materialTitle);
}

async function processMaterialJobAndConfirmQuestion(page: Page) {
  await page.goto(`${adminUrl}/jobs?status=queued`);
  await expect(page.getByRole("heading", { name: "任务", exact: true })).toBeVisible();
  const queuedMaterialJob = page.locator("article").filter({ hasText: materialTitle }).first();
  let handledFromAdminPage = false;

  if (await queuedMaterialJob.isVisible().catch(() => false)) {
    await queuedMaterialJob.getByRole("button", { name: "立即处理" }).click();
    await expect(page).toHaveURL(/\/admin\/jobs\?(?:notice|error)=/);
    handledFromAdminPage = true;
  }

  if (!handledFromAdminPage) {
    await processMaterialExtractionJobForE2e();
  }

  await waitForExtractedMaterialQuestion();
  await page.goto(`${adminUrl}/materials`);
  await expect(page.getByRole("heading", { name: "资料", exact: true })).toBeVisible();
  await expect(page.locator("body")).toContainText(extractedQuestionStem);
  await page.locator("article").filter({ hasText: extractedQuestionStem }).first().getByRole("button", { name: "确认入题库" }).click();
  await expect(page.getByText("候选题已确认并加入题库。")).toBeVisible();

  await page.goto(`${adminUrl}/questions?q=${encodeURIComponent(extractedQuestionStem)}`);
  await expect(page.locator("body")).toContainText(extractedQuestionStem);
  await expect(page.locator("body")).toContainText("用户上传");
}

async function waitForExtractedMaterialQuestion() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = await prisma.materialQuestionCandidate.findFirst({
      where: {
        stem: extractedQuestionStem
      },
      select: {
        id: true
      }
    });

    if (candidate) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("E2E extracted material question was not created.");
}

async function processMaterialExtractionJobForE2e() {
  const { processJob } = await import("@openexam/core/jobs");
  const material = await prisma.material.findFirst({
    where: {
      title: materialTitle
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true
    }
  });

  if (!material) {
    throw new Error("E2E material was not created.");
  }

  const jobs = await prisma.job.findMany({
    where: {
      type: "extract_material_questions"
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });
  const job = jobs.find((item) => {
    const payload = item.payload;

    return payload && typeof payload === "object" && !Array.isArray(payload) && "materialId" in payload && payload.materialId === material.id;
  });

  if (!job) {
    throw new Error("E2E material extraction job was not created.");
  }

  if (job.status === "succeeded") {
    return;
  }

  const result = await processJob(job.id);

  if (!result.ok) {
    throw new Error(result.error);
  }
}

async function practiceConfirmedMaterialQuestion(page: Page) {
  await page.goto(`${webUrl}/materials`);
  const materialCard = page.locator("article").filter({ hasText: materialTitle }).first();

  await expect(materialCard).toContainText("练习资料题");
  await materialCard.getByRole("link", { name: "练习资料题" }).click();
  await expect(page).toHaveURL(/\/practice\?material=/);
  const materialId = new URL(page.url()).searchParams.get("material");

  if (!materialId) {
    throw new Error("Material practice URL did not include material id.");
  }

  await expect(page.locator("body")).toContainText(extractedQuestionStem);
  await page.locator('input[name="answer"][value="A"]').check();
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.getByText("回答正确")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/practice\\?(?:mode=new&)?material=${materialId}&attempt=`));
  await page.getByRole("link", { name: "再练一题" }).click();
  await expect(page).toHaveURL(new RegExp(`/practice\\?(?:mode=new&)?material=${materialId}&skip=`));
  await expect(page.locator("body")).toContainText("已练完");
  await expect(page.getByRole("link", { name: "重练已练题" })).toBeVisible();
}

async function reviewAnalysisAndGeneratePlan(page: Page) {
  await page.goto(`${webUrl}/analysis`);
  await expect(page.getByRole("heading", { name: "学习分析" })).toBeVisible();
  await expect(page.locator("body")).toContainText("事务基础");
  await expect(page.locator("body")).toContainText("正确率");

  await page.goto(`${webUrl}/plan`);
  acceptNextDialog(page);
  await page.getByRole("button", { name: "生成学习计划" }).click();
  await expect(page.getByText("学习计划已生成。")).toBeVisible();
  await expect(page.locator("body")).toContainText("第 1 天");
  await expect(page.locator("body")).toContainText("第 30 天");

  await page.getByRole("button", { name: "标记完成" }).first().click();
  await expect(page.getByText("计划任务已更新。")).toBeVisible();
  await expect(page.locator("body")).toContainText("已完成");
}

function futureDateInput(daysFromToday: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function configureAdminAiPreset(page: Page) {
  await page.goto(`${adminUrl}/ai`);
  const form = page.locator('form:has(button:has-text("新增预设"))').first();

  await form.locator('input[name="model"]').fill(aiPresetModel);
  await form.locator('input[name="label"]').fill("E2E OpenAI Mock");
  for (const taskType of ["explain_question", "generate_image", "extract_questions", "generate_plan"]) {
    await form.locator(`input[name="defaultForTasks"][value="${taskType}"]`).check();
  }
  await form.locator('input[name="capabilities"][value="image"]').check();
  await form.locator('input[name="temperature"]').fill("0.2");
  await form.locator('input[name="maxTokens"]').fill("640");
  await form.getByRole("button", { name: "新增预设" }).click();
  await expect(page.getByText("模型预设已保存。")).toBeVisible();
  await expect(page.locator("body")).toContainText(aiPresetModel);
}

async function rejectLearnerFromAdmin(browser: Browser) {
  const page = await newPage(browser);

  await page.goto(`${adminUrl}/login`);
  await page.getByLabel("邮箱").fill(learnerEmail);
  await page.getByLabel("密码").fill(learnerPassword);
  await page.getByRole("button", { name: "登录管理端" }).click();
  await expect(page.getByText("该账号没有管理端权限。")).toBeVisible();
}

async function hideAndRestorePaper(adminPage: Page, webPage: Page) {
  await adminPage.goto(`${adminUrl}/papers`);
  await paperAdminCard(adminPage).getByRole("button", { name: "隐藏试卷" }).first().click();
  await expect(adminPage.getByText("试卷已隐藏。")).toBeVisible();

  await webPage.goto(`${webUrl}/papers`);
  await expect(webPage.locator("body")).not.toContainText(paperTitle);

  await adminPage.goto(`${adminUrl}/papers?archived=archived`);
  await paperAdminCard(adminPage).getByRole("button", { name: "恢复试卷" }).first().click();
  await expect(adminPage.getByText("试卷已恢复。")).toBeVisible();

  await webPage.goto(`${webUrl}/papers`);
  await expect(webPage.locator("body")).toContainText(paperTitle);
}

function paperAdminCard(page: Page) {
  return page.locator(`section:has(h2:has-text("${paperTitle}"))`).first();
}

function acceptNextDialog(page: Page) {
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
}

async function choosePixelSelect(scope: Page | Locator, name: string, value: string) {
  const root = scope.locator(`.pixel-select:has(input[name="${name}"])`).first();
  const input = root.locator(`input[name="${name}"]`);

  if ((await input.inputValue()) === value) {
    return;
  }

  await root.locator(".pixel-select-trigger").click();
  const listbox = root.getByRole("listbox");

  if (!(await listbox.isVisible({ timeout: 1000 }).catch(() => false))) {
    await input.evaluate((element, selectedValue) => {
      const field = element as HTMLInputElement;

      field.value = selectedValue;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await expect(input).toHaveValue(value);
    return;
  }

  await expect(listbox).toBeVisible();
  await expect(root.getByRole("option").first()).toBeVisible();
  await root.locator(`.pixel-select-option[data-value="${escapeCssAttribute(value)}"]`).click();
  await expect(input).toHaveValue(value);
}

function escapeCssAttribute(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
      OR: [
        {
          stem: {
            startsWith: "E2E 单选题"
          }
        },
        {
          stem: extractedQuestionStem
        }
      ]
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
  const materials = await prisma.material.findMany({
    where: {
      OR: [
        ...(userIds.length > 0 ? [{ ownerId: { in: userIds } }] : []),
        {
          title: {
            startsWith: "E2E "
          }
        }
      ]
    },
    select: { id: true, storageKey: true }
  });
  const materialIds = materials.map((material) => material.id);

  if (userIds.length > 0) {
    await prisma.asset.deleteMany({
      where: {
        OR: [
          {
            ownerId: {
              in: userIds
            }
          },
          {
            source: "wrong_note_review_card"
          }
        ]
      }
    });
    await prisma.job.deleteMany({
      where: {
        OR: [
          {
            userId: {
              in: userIds
            }
          },
          {
            type: "generate_wrong_note_review_card"
          }
        ]
      }
    });
  }

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

  if (materialIds.length > 0) {
    await prisma.materialQuestionCandidate.deleteMany({ where: { materialId: { in: materialIds } } });
    await prisma.asset.deleteMany({ where: { materialId: { in: materialIds } } });
    await prisma.job.deleteMany({
      where: {
        OR: [
          ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
          {
            type: "extract_material_questions"
          }
        ]
      }
    });
    await prisma.material.deleteMany({ where: { id: { in: materialIds } } });
  }

  if (userIds.length > 0) {
    await prisma.aiCall.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userProviderKey.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.examGoal.deleteMany({ where: { userId: { in: userIds } } });
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

  await prisma.aiProviderPreset.deleteMany({ where: { model: aiPresetModel } });

  if (questionIds.length > 0) {
    await prisma.questionVersion.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.questionKnowledgeNode.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  }

  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
