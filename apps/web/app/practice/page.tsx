import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { RichContent } from "@/components/rich-content";
import { requireWebSession } from "@/lib/auth";
import { formatGoalPath } from "@openexam/core/exam-core";
import { FeedbackMessage, PixelChoice, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import { getAttemptResult, getPracticeQuestion } from "@openexam/core/practice";
import { AiExplainButton } from "@/components/ai-explain-button";
import { collectPracticeQuestionAction, confirmPracticeAnswerScoreAction, generatePracticeAnswerAiExplanationAction, submitPracticeAnswerAction } from "./actions";

type PracticePageProps = {
  searchParams: Promise<{ attempt?: string; error?: string; material?: string; mode?: string; question?: string; retry?: string; skip?: string; knowledgeNodeId?: string }>;
};

const sourceTypeLabels: Record<string, string> = {
  original: "原创",
  authorized: "授权",
  public_domain_or_open: "公开开放",
  user_uploaded: "用户上传",
  ai_generated: "AI 生成",
  unknown: "未知来源"
};

const questionKindLabels: Record<string, string> = {
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  blank: "填空",
  short_answer: "简答",
  case_analysis: "案例"
};

export default async function PracticePage({ searchParams }: PracticePageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const materialId = params.retry ? null : params.material;
  const [state, attemptResult] = await Promise.all([
    getPracticeQuestion(session.user.id, {
      directQuestionId: params.question,
      excludeQuestionId: params.skip,
      knowledgeNodeId: params.knowledgeNodeId,
      materialId,
      mode: params.mode,
      retryQuestionId: params.retry
    }),
    params.attempt ? getAttemptResult(session.user.id, params.attempt) : Promise.resolve(null)
  ]);
  const shouldShowPracticeState = !attemptResult;

  return (
    <AppShell section="learner" eyebrow="练习闭环" title="练习">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} />
        {attemptResult ? (
          <AttemptResultCard
            knowledgeNodeId={params.knowledgeNodeId}
            materialId={state.status !== "no_goal" ? state.material?.id ?? materialId : materialId}
            mode={state.status !== "no_goal" ? state.mode : params.mode}
            result={attemptResult}
          />
        ) : null}

        {shouldShowPracticeState && state.status === "no_goal" ? (
          <EmptyState title="尚未选择考试目标" description="先设置主目标，练习题会按目标范围筛选。" actionHref="/goals" actionLabel="选择目标" />
        ) : null}

        {shouldShowPracticeState && state.status === "error" ? (
          <EmptyState title="无法开始重练" description={state.error} actionHref="/wrong-notes" actionLabel="返回错题本" />
        ) : null}

        {shouldShowPracticeState && state.status === "empty" ? (
          state.emptyReason === "knowledge_required" ? (
            <EmptyState
              title="请选择知识点"
              description={`${formatGoalPath(state.goal)} 覆盖多个科目，先从知识树进入具体科目或知识点。`}
              actionHref="/knowledge"
              actionLabel="选择知识点"
              secondaryHref={practiceHref({ mode: "comprehensive" })}
              secondaryLabel="综合练习"
            />
          ) : state.emptyReason === "no_new_questions" ? (
            <EmptyState
              title="当前范围新题已练完"
              description="默认练习不会重复已提交过的题。可以练未掌握错题、显式重练，或生成新题。"
              actionHref={practiceHref({ mode: "wrong", knowledgeNodeId: params.knowledgeNodeId, materialId })}
              actionLabel="练错题"
              secondaryHref={practiceHref({ mode: "retry_practiced", knowledgeNodeId: params.knowledgeNodeId, materialId })}
              secondaryLabel="重练已练题"
            />
          ) : state.emptyReason === "no_wrong_questions" ? (
            <EmptyState
              title="当前范围暂无未掌握错题"
              description="错题练习默认只使用未掌握错题。可以返回练新题或显式重练已练题。"
              actionHref={practiceHref({ mode: "new", knowledgeNodeId: params.knowledgeNodeId, materialId })}
              actionLabel="练新题"
              secondaryHref={practiceHref({ mode: "retry_practiced", knowledgeNodeId: params.knowledgeNodeId, materialId })}
              secondaryLabel="重练已练题"
            />
          ) : state.emptyReason === "no_practiced_questions" ? (
            <EmptyState
              title="当前范围暂无已练题"
              description="重练只会使用当前筛选范围内已经提交过的题。"
              actionHref={practiceHref({ mode: "new", knowledgeNodeId: params.knowledgeNodeId, materialId })}
              actionLabel="练新题"
              secondaryHref="/knowledge"
              secondaryLabel="选择知识点"
            />
          ) : state.emptyReason === "material_unavailable" ? (
            <EmptyState
              title="资料练习暂无题目"
              description={
                state.material
                  ? `${state.material.title} 还没有已确认入库的题目。`
                  : "该资料不存在、不可访问，或还没有已确认入库的题目。"
              }
              actionHref="/materials"
              actionLabel="返回资料"
            />
          ) : state.emptyReason === "material_goal_mismatch" ? (
            <EmptyState
              title="当前目标暂无该资料可练习题"
              description={`${state.material?.title ?? "该资料"} 的确认题不在 ${formatGoalPath(state.goal)} 范围内。`}
              actionHref="/goals"
              actionLabel="调整目标"
              secondaryHref="/materials"
              secondaryLabel="返回资料"
            />
          ) : (
            <EmptyState
              title="当前目标暂无可练习题"
              description={`${formatGoalPath(state.goal)} 还没有公开且审核通过的题目。`}
              actionHref="/goals"
              actionLabel="调整目标"
            />
          )
        ) : null}

        {shouldShowPracticeState && state.status === "ready" ? (
          <section className="pixel-panel grid gap-5 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">{formatGoalPath(state.goal)}</p>
              {state.material ? <p className="mt-1 text-sm font-black text-[var(--teal)]">资料练习：{state.material.title}</p> : null}
              {state.question.caseMaterial ? (
                <div className="mt-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
                  <p className="text-sm font-bold text-[var(--muted)]">案例材料</p>
                  <p className="mt-1 whitespace-pre-line font-bold leading-7">{state.question.caseMaterial}</p>
                </div>
              ) : null}
              <RichContent blocks={state.question.stemBlocks} className="mt-2" fallback={state.question.stem} textClassName="text-2xl font-black" />
            </div>
            <div className="flex flex-wrap gap-2">
              {state.question.knowledgeNodes.map((node) => (
                <span key={node} className="status-chip px-2 py-1">
                  {node}
                </span>
              ))}
              {state.question.difficulty ? <span className="status-chip px-2 py-1">难度 {state.question.difficulty}</span> : null}
              <span className="status-chip px-2 py-1">{questionKindLabels[state.question.kind] ?? state.question.kind}</span>
              <span className="status-chip px-2 py-1">{sourceTypeLabels[state.question.sourceType] ?? state.question.sourceType}</span>
            </div>
            <form action={submitPracticeAnswerAction} className="grid gap-4">
              <input name="questionId" type="hidden" value={state.question.id} />
              <input name="materialId" type="hidden" value={state.material?.id ?? ""} />
              <input name="knowledgeNodeId" type="hidden" value={params.knowledgeNodeId ?? ""} />
              <input name="practiceMode" type="hidden" value={state.mode} />
              <input name="retry" type="hidden" value={params.retry ? "true" : "false"} />
              <PracticeAnswerFields question={state.question} />
              <div className="flex flex-wrap gap-3">
                <SubmitButton className="px-4 py-2" label="提交答案" />
                <AiExplainButton questionId={state.question.id} />
                <Link href={"/wrong-notes" as Route} className="pixel-button bg-white px-4 py-2">
                  查看错题本
                </Link>
                <Link href={"/practice/generate" as Route} className="pixel-button bg-white px-4 py-2">
                  AI 出题
                </Link>
              </div>
            </form>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}

function AttemptResultCard({
  knowledgeNodeId,
  materialId,
  mode,
  result
}: {
  knowledgeNodeId?: string | null;
  materialId?: string | null;
  mode?: string | null;
  result: NonNullable<Awaited<ReturnType<typeof getAttemptResult>>>;
}) {
  const nextHref = practiceHref({ mode, knowledgeNodeId, materialId, skipQuestionId: result.question.id });

  return (
    <section className="pixel-panel grid gap-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase text-[var(--muted)]">本次结果</p>
        <h2 className={`mt-2 text-2xl font-black ${result.isCorrect === true ? "text-[var(--teal)]" : result.isCorrect === false ? "text-[var(--danger)]" : ""}`}>
          {result.isCorrect === null ? "已提交，等待评分" : result.isCorrect ? "回答正确" : "回答错误"}
        </h2>
        <p className="mt-1 font-bold text-[var(--muted)]">
          得分 {result.score} / {result.maxScore}，你的答案 {result.userAnswer || "未记录"}，正确答案 {result.correctAnswer ?? "未配置"}
        </p>
        {result.aiSuggestedScore !== null ? (
          <p className="mt-2 font-bold text-[var(--muted)]">
            AI 建议分 {result.aiSuggestedScore} / {result.maxScore}
            <span className={`ml-2 inline-block status-chip px-2 py-1 text-xs ${result.userConfirmed ? "bg-[var(--teal)]" : "bg-[var(--warning)]"}`}>
              {result.userConfirmed ? "已确认" : "待确认"}
            </span>
          </p>
        ) : null}
      </div>
      <div className="border-2 border-black bg-[var(--surface-subtle)] p-3">
        <p className="text-sm font-bold text-[var(--muted)]">题目</p>
        <RichContent blocks={result.question.stemBlocks} className="mt-1" fallback={result.question.stem} textClassName="font-bold" />
      </div>
      {result.explanation || result.explanationBlocks ? (
        <div className="border-2 border-black bg-white p-3">
          <p className="text-sm font-bold text-[var(--muted)]">解析</p>
          <RichContent blocks={result.explanationBlocks} className="mt-1" fallback={result.explanation} textClassName="leading-7" />
        </div>
      ) : null}
      {result.referenceAnswerBlocks ? (
        <div className="border-2 border-black bg-white p-3">
          <p className="text-sm font-bold text-[var(--muted)]">参考答案</p>
          <RichContent blocks={result.referenceAnswerBlocks} className="mt-1" />
        </div>
      ) : null}
      {result.aiSuggestedScore !== null && !result.userConfirmed ? (
        <form action={confirmPracticeAnswerScoreAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 sm:grid-cols-[1fr_auto]">
          <input name="attemptId" type="hidden" value={result.id} />
          <input name="attemptAnswerId" type="hidden" value={result.attemptAnswerId} />
          <input name="materialId" type="hidden" value={materialId ?? ""} />
          <input name="knowledgeNodeId" type="hidden" value={knowledgeNodeId ?? ""} />
          <input name="practiceMode" type="hidden" value={mode ?? ""} />
          <TextField defaultValue={String(result.aiSuggestedScore)} inputClassName="w-32 border-2 px-2 py-1" label="确认分" labelClassName="gap-1" max={result.maxScore} min="0" name="score" step="0.5" type="number" />
          <SubmitButton className="bg-white px-3 py-2" label="确认分数" />
        </form>
      ) : null}
      {result.aiSuggestedScore !== null && result.userConfirmed ? (
        <form action={confirmPracticeAnswerScoreAction} className="grid gap-3 border-2 border-[var(--teal)] bg-[var(--teal)]/10 p-3">
          <input name="attemptId" type="hidden" value={result.id} />
          <input name="attemptAnswerId" type="hidden" value={result.attemptAnswerId} />
          <input name="materialId" type="hidden" value={materialId ?? ""} />
          <input name="knowledgeNodeId" type="hidden" value={knowledgeNodeId ?? ""} />
          <input name="practiceMode" type="hidden" value={mode ?? ""} />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-[var(--muted)]">
              已确认得分 <span className="text-lg font-black text-black">{result.score}</span>
            </p>
            <span className="status-chip bg-[var(--teal)] px-2 py-1 text-xs">已确认</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <TextField defaultValue={String(result.score ?? result.aiSuggestedScore)} inputClassName="w-32 border-2 px-2 py-1" label="调整分" labelClassName="gap-1" max={result.maxScore} min="0" name="score" step="0.5" type="number" />
            <SubmitButton className="bg-white px-3 py-2" label="重新确认" />
          </div>
        </form>
      ) : null}
      {result.aiExplanation ? (
        <div className="border-2 border-black bg-[var(--ai-soft)] p-3">
          <p className="text-sm font-bold text-[var(--muted)]">本题 AI 解析</p>
          <p className="mt-1 whitespace-pre-line leading-7">{result.aiExplanation}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Link href={nextHref} className="pixel-button px-4 py-2">
          再练一题
        </Link>
        <Link href={"/attempts" as Route} className="pixel-button bg-white px-4 py-2">
          查看作答记录
        </Link>
        <Link href={"/wrong-notes" as Route} className="pixel-button bg-white px-4 py-2">
          查看错题本
        </Link>
        {result.isCorrect !== false && result.userAnswer ? (
          <form action={collectPracticeQuestionAction}>
            <input name="questionId" type="hidden" value={result.question.id} />
            <input name="attemptId" type="hidden" value={result.id} />
            <input name="attemptAnswerId" type="hidden" value={result.attemptAnswerId} />
            <input name="materialId" type="hidden" value={materialId ?? ""} />
            <input name="knowledgeNodeId" type="hidden" value={knowledgeNodeId ?? ""} />
            <input name="practiceMode" type="hidden" value={mode ?? ""} />
            <SubmitButton className="bg-white px-4 py-2" label="收藏复习" />
          </form>
        ) : null}
        <form action={generatePracticeAnswerAiExplanationAction}>
          <input name="attemptId" type="hidden" value={result.id} />
          <input name="attemptAnswerId" type="hidden" value={result.attemptAnswerId} />
          <input name="materialId" type="hidden" value={materialId ?? ""} />
          <input name="knowledgeNodeId" type="hidden" value={knowledgeNodeId ?? ""} />
          <input name="practiceMode" type="hidden" value={mode ?? ""} />
          <SubmitButton className="bg-white px-4 py-2" label={result.aiExplanation ? "重新生成本题 AI 解析" : "请求本题 AI 解析"} />
        </form>
      </div>
    </section>
  );
}

function PracticeAnswerFields({
  question
}: {
  question: Extract<Awaited<ReturnType<typeof getPracticeQuestion>>, { status: "ready" }>["question"];
}) {
  if (question.kind === "short_answer" || question.kind === "case_analysis") {
    return (
      <TextareaField label="作答内容" name="answer" placeholder="输入作答内容" required textareaClassName={`text-base ${question.kind === "case_analysis" ? "min-h-56" : "min-h-36"}`} />
    );
  }

  if (question.kind === "blank") {
    return (
      <TextField inputClassName="p-3 text-base" label="填空答案" name="answer" placeholder="输入填空答案" required />
    );
  }

  if (question.kind === "true_false") {
    return (
      <fieldset className="grid gap-3">
        <legend className="sr-only">选择判断答案</legend>
        {[
          { key: "true", text: "正确" },
          { key: "false", text: "错误" }
        ].map((option) => (
          <PixelChoice key={option.key} className="border-3" inputClassName="h-4 w-4 accent-[var(--primary)]" name="answer" required type="radio" value={option.key}>
            {option.text}
          </PixelChoice>
        ))}
      </fieldset>
    );
  }

  if (question.kind === "multiple_choice") {
    return (
      <fieldset className="grid gap-3">
        <legend className="sr-only">选择多个答案</legend>
        {question.options.map((option) => (
          <PixelChoice key={option.key} className="border-3" inputClassName="h-4 w-4 accent-[var(--primary)]" name="answer" type="checkbox" value={option.key}>
            <span>
              <span className="mr-2 font-black">{option.key}.</span>
              <RichContent blocks={option.blocks} fallback={option.text} inline textClassName="font-bold" />
            </span>
          </PixelChoice>
        ))}
      </fieldset>
    );
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">选择答案</legend>
      {question.options.map((option) => (
        <PixelChoice key={option.key} className="border-3" inputClassName="h-4 w-4 accent-[var(--primary)]" name="answer" required type="radio" value={option.key}>
          <span>
            <span className="mr-2 font-black">{option.key}.</span>
            <RichContent blocks={option.blocks} fallback={option.text} inline textClassName="font-bold" />
          </span>
        </PixelChoice>
      ))}
    </fieldset>
  );
}

function practiceHref(input: { mode?: string | null; knowledgeNodeId?: string | null; materialId?: string | null; skipQuestionId?: string | null }) {
  const params = new URLSearchParams();

  if (input.mode) {
    params.set("mode", input.mode);
  }

  if (input.knowledgeNodeId) {
    params.set("knowledgeNodeId", input.knowledgeNodeId);
  }

  if (input.materialId) {
    params.set("material", input.materialId);
  }

  if (input.skipQuestionId) {
    params.set("skip", input.skipQuestionId);
  }

  const query = params.toString();

  return (query ? `/practice?${query}` : "/practice") as Route;
}

function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel
}: {
  title: string;
  description: string;
  actionHref: Route;
  actionLabel: string;
  secondaryHref?: Route;
  secondaryLabel?: string;
}) {
  return (
    <section className="pixel-panel grid gap-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase text-[var(--muted)]">练习闭环</p>
        <h2 className="mt-2 text-2xl font-black">{title}</h2>
        <p className="mt-1 font-bold text-[var(--muted)]">{description}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href={actionHref} className="pixel-button w-fit px-4 py-2">
          {actionLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link href={secondaryHref} className="pixel-button w-fit bg-white px-4 py-2">
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
