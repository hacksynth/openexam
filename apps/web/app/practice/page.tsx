import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { formatGoalPath } from "@openexam/core/exam-core";
import { getAttemptResult, getPracticeQuestion } from "@openexam/core/practice";
import { submitSingleChoiceAnswerAction } from "./actions";

type PracticePageProps = {
  searchParams: Promise<{ attempt?: string; error?: string; retry?: string; skip?: string }>;
};

const sourceTypeLabels: Record<string, string> = {
  original: "原创",
  authorized: "授权",
  public_domain_or_open: "公开开放",
  user_uploaded: "用户上传",
  ai_generated: "AI 生成",
  unknown: "未知来源"
};

export default async function PracticePage({ searchParams }: PracticePageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const [state, attemptResult] = await Promise.all([
    getPracticeQuestion(session.user.id, {
      excludeQuestionId: params.skip,
      retryQuestionId: params.retry
    }),
    params.attempt ? getAttemptResult(session.user.id, params.attempt) : Promise.resolve(null)
  ]);

  return (
    <AppShell section="learner" eyebrow="练习闭环" title="练习">
      <section className="grid gap-5">
        {params.error ? <Feedback error={params.error} /> : null}
        {attemptResult ? <AttemptResultCard result={attemptResult} /> : null}

        {state.status === "no_goal" ? (
          <EmptyState title="尚未选择考试目标" description="先设置主目标，练习题会按目标范围筛选。" actionHref="/goals" actionLabel="选择目标" />
        ) : null}

        {state.status === "error" ? (
          <EmptyState title="无法开始重练" description={state.error} actionHref="/wrong-notes" actionLabel="返回错题本" />
        ) : null}

        {state.status === "empty" ? (
          <EmptyState
            title="当前目标暂无可练习单选题"
            description={`${formatGoalPath(state.goal)} 还没有公开且审核通过的单选题。`}
            actionHref="/goals"
            actionLabel="调整目标"
          />
        ) : null}

        {state.status === "ready" ? (
          <section className="pixel-panel grid gap-5 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">{formatGoalPath(state.goal)}</p>
              <h2 className="mt-2 text-2xl font-black">{state.question.stem}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {state.question.knowledgeNodes.map((node) => (
                <span key={node} className="status-chip px-2 py-1">
                  {node}
                </span>
              ))}
              {state.question.difficulty ? <span className="status-chip px-2 py-1">难度 {state.question.difficulty}</span> : null}
              <span className="status-chip px-2 py-1">{sourceTypeLabels[state.question.sourceType] ?? state.question.sourceType}</span>
            </div>
            <form action={submitSingleChoiceAnswerAction} className="grid gap-4">
              <input name="questionId" type="hidden" value={state.question.id} />
              <fieldset className="grid gap-3">
                <legend className="sr-only">选择答案</legend>
                {state.question.options.map((option) => (
                  <label key={option.key} className="flex min-w-0 items-start gap-3 border-3 border-black bg-[var(--surface-subtle)] p-3 font-bold">
                    <input className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]" name="answer" required type="radio" value={option.key} />
                    <span className="min-w-0">
                      <span className="mr-2 font-black">{option.key}.</span>
                      {option.text}
                    </span>
                  </label>
                ))}
              </fieldset>
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
  result
}: {
  result: NonNullable<Awaited<ReturnType<typeof getAttemptResult>>>;
}) {
  return (
    <section className="pixel-panel grid gap-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase text-[var(--muted)]">本次结果</p>
        <h2 className={`mt-2 text-2xl font-black ${result.isCorrect ? "text-[var(--teal)]" : "text-[var(--danger)]"}`}>
          {result.isCorrect ? "回答正确" : "回答错误"}
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
        <Link href={`/practice?skip=${result.question.id}` as Route} className="pixel-button px-4 py-2">
          再练一题
        </Link>
        <Link href={"/attempts" as Route} className="pixel-button bg-white px-4 py-2">
          查看作答记录
        </Link>
        <Link href={"/wrong-notes" as Route} className="pixel-button bg-white px-4 py-2">
          查看错题本
        </Link>
      </div>
    </section>
  );
}

function EmptyState({
  title,
  description,
  actionHref,
  actionLabel
}: {
  title: string;
  description: string;
  actionHref: Route;
  actionLabel: string;
}) {
  return (
    <section className="pixel-panel grid gap-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase text-[var(--muted)]">练习闭环</p>
        <h2 className="mt-2 text-2xl font-black">{title}</h2>
        <p className="mt-1 font-bold text-[var(--muted)]">{description}</p>
      </div>
      <Link href={actionHref} className="pixel-button w-fit px-4 py-2">
        {actionLabel}
      </Link>
    </section>
  );
}

function Feedback({ error }: { error: string }) {
  return <p className="border-3 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>;
}
