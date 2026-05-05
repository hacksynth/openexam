import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { formatGoalPath } from "@openexam/core/exam-core";
import { getAttemptResult, getPracticeQuestion } from "@openexam/core/practice";
import { collectPracticeQuestionAction, submitPracticeAnswerAction } from "./actions";

type PracticePageProps = {
  searchParams: Promise<{ attempt?: string; error?: string; material?: string; retry?: string; skip?: string; knowledgeNodeId?: string }>;
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
      excludeQuestionId: params.skip,
      knowledgeNodeId: params.knowledgeNodeId,
      materialId,
      retryQuestionId: params.retry
    }),
    params.attempt ? getAttemptResult(session.user.id, params.attempt) : Promise.resolve(null)
  ]);

  return (
    <AppShell section="learner" eyebrow="练习闭环" title="练习">
      <section className="grid gap-5">
        {params.error ? <Feedback error={params.error} /> : null}
        {attemptResult ? <AttemptResultCard materialId={state.status !== "no_goal" ? state.material?.id ?? materialId : materialId} result={attemptResult} /> : null}

        {state.status === "no_goal" ? (
          <EmptyState title="尚未选择考试目标" description="先设置主目标，练习题会按目标范围筛选。" actionHref="/goals" actionLabel="选择目标" />
        ) : null}

        {state.status === "error" ? (
          <EmptyState title="无法开始重练" description={state.error} actionHref="/wrong-notes" actionLabel="返回错题本" />
        ) : null}

        {state.status === "empty" ? (
          state.emptyReason === "material_unavailable" ? (
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

        {state.status === "ready" ? (
          <section className="pixel-panel grid gap-5 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">{formatGoalPath(state.goal)}</p>
              {state.material ? <p className="mt-1 text-sm font-black text-[var(--teal)]">资料练习：{state.material.title}</p> : null}
              <h2 className="mt-2 text-2xl font-black">{state.question.stem}</h2>
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
              <input name="retry" type="hidden" value={params.retry ? "true" : "false"} />
              <PracticeAnswerFields question={state.question} />
              <div className="flex flex-wrap gap-3">
                <button className="pixel-button px-4 py-2" type="submit">
                  提交答案
                </button>
                <Link href={"/wrong-notes" as Route} className="pixel-button bg-white px-4 py-2">
                  查看错题本
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
  materialId,
  result
}: {
  materialId?: string | null;
  result: NonNullable<Awaited<ReturnType<typeof getAttemptResult>>>;
}) {
  const nextHref = materialId
    ? (`/practice?material=${encodeURIComponent(materialId)}&skip=${encodeURIComponent(result.question.id)}` as Route)
    : (`/practice?skip=${encodeURIComponent(result.question.id)}` as Route);

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
      </div>
      <div className="border-2 border-black bg-[var(--surface-subtle)] p-3">
        <p className="text-sm font-bold text-[var(--muted)]">题目</p>
        <p className="mt-1 font-bold">{result.question.stem}</p>
      </div>
      {result.explanation ? (
        <div className="border-2 border-black bg-white p-3">
          <p className="text-sm font-bold text-[var(--muted)]">解析</p>
          <p className="mt-1 leading-7">{result.explanation}</p>
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
        {result.isCorrect ? (
          <form action={collectPracticeQuestionAction}>
            <input name="questionId" type="hidden" value={result.question.id} />
            <input name="attemptId" type="hidden" value={result.id} />
            <input name="materialId" type="hidden" value={materialId ?? ""} />
            <button className="pixel-button bg-white px-4 py-2" type="submit">
              收藏复习
            </button>
          </form>
        ) : null}
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
      <label className="grid gap-2 text-sm font-bold">
        作答内容
        <textarea className="min-h-36 border-3 border-black bg-white p-3 text-base font-bold leading-7" name="answer" placeholder="输入作答内容" required />
      </label>
    );
  }

  if (question.kind === "blank") {
    return (
      <label className="grid gap-2 text-sm font-bold">
        填空答案
        <input className="border-3 border-black bg-white p-3 text-base font-bold" name="answer" placeholder="输入填空答案" required />
      </label>
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
          <label key={option.key} className="flex min-w-0 items-start gap-3 border-3 border-black bg-[var(--surface-subtle)] p-3 font-bold">
            <input className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" name="answer" required type="radio" value={option.key} />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (question.kind === "multiple_choice") {
    return (
      <fieldset className="grid gap-3">
        <legend className="sr-only">选择多个答案</legend>
        {question.options.map((option) => (
          <label key={option.key} className="flex min-w-0 items-start gap-3 border-3 border-black bg-[var(--surface-subtle)] p-3 font-bold">
            <input className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" name="answer" type="checkbox" value={option.key} />
            <span className="min-w-0 break-words">
              <span className="mr-2 font-black">{option.key}.</span>
              {option.text}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="sr-only">选择答案</legend>
      {question.options.map((option) => (
        <label key={option.key} className="flex min-w-0 items-start gap-3 border-3 border-black bg-[var(--surface-subtle)] p-3 font-bold">
          <input className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" name="answer" required type="radio" value={option.key} />
          <span className="min-w-0 break-words">
            <span className="mr-2 font-black">{option.key}.</span>
            {option.text}
          </span>
        </label>
      ))}
    </fieldset>
  );
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

function Feedback({ error }: { error: string }) {
  return <p className="border-3 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>;
}
