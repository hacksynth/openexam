import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getAttemptReport } from "@openexam/core/papers";
import { collectAttemptQuestionAction, confirmAttemptAnswerScoreAction } from "../../papers/actions";

type AttemptReportPageProps = {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
};

const statusLabels: Record<string, string> = {
  in_progress: "进行中",
  paused: "已暂停",
  submitted: "已提交",
  graded: "已评分",
  abandoned: "已放弃"
};

export default async function AttemptReportPage({ params, searchParams }: AttemptReportPageProps) {
  const session = await requireWebSession();
  const [{ attemptId }, query] = await Promise.all([params, searchParams]);
  const report = await getAttemptReport(session.user.id, attemptId);

  return (
    <AppShell section="learner" eyebrow="作答分析" title="作答报告">
      <section className="grid gap-5">
        <Feedback error={query.error} notice={query.notice} />
        {!report ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <h2 className="text-2xl font-black">报告不存在</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">该记录不存在，或不属于当前账号。</p>
            </div>
            <Link href={"/attempts" as Route} className="pixel-button w-fit px-4 py-2">
              返回记录
            </Link>
          </section>
        ) : (
          <>
            <section className="pixel-panel grid gap-4 p-5">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{report.kind === "paper" ? "试卷" : "练习"}</span>
                  <span className="status-chip px-2 py-1">{statusLabels[report.status] ?? report.status}</span>
                  <span className="status-chip px-2 py-1">{formatDateTime(report.submittedAt ?? report.startedAt)}</span>
                </div>
                <h2 className="break-words text-2xl font-black leading-9">{report.title}</h2>
                <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{report.goalPath}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="得分" value={`${report.totalScore} / ${report.maxScore}`} />
                <Metric label="正确率" value={`${report.summary.accuracy}%`} />
                <Metric label="正确/总题" value={`${report.summary.correctCount} / ${report.summary.totalQuestions}`} />
                <Metric label="未答题" value={String(report.summary.unansweredCount)} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={"/attempts" as Route} className="pixel-button bg-white px-4 py-2">
                  返回记录
                </Link>
                <Link href={report.kind === "paper" ? ("/papers" as Route) : ("/practice" as Route)} className="pixel-button bg-white px-4 py-2">
                  {report.kind === "paper" ? "继续试卷" : "继续练习"}
                </Link>
              </div>
            </section>

            <section className="pixel-panel grid gap-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase text-[var(--muted)]">Knowledge</p>
                <h2 className="mt-1 text-xl font-black">知识点统计</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {report.summary.knowledgeStats.map((node) => (
                  <div key={node.title} className="border-2 border-black bg-[var(--surface-subtle)] p-3">
                    <p className="break-words font-black">{node.title}</p>
                    <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                      正确 {node.correct} / {node.total}，得分 {node.score} / {node.maxScore}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4">
              {report.answers.map((answer) => (
                <article key={answer.id} className="pixel-panel grid gap-4 p-5">
                  <div className="flex flex-wrap gap-2">
                    <span className={`status-chip px-2 py-1 ${answer.isCorrect === true ? "bg-[var(--teal)]" : answer.isCorrect === false ? "bg-[var(--danger)] text-white" : ""}`}>
                      {answer.isCorrect === null ? "待确认" : answer.isCorrect ? "正确" : "错误"}
                    </span>
                    <span className="status-chip px-2 py-1">
                      {answer.score} / {answer.maxScore}
                    </span>
                    {answer.question.knowledgeNodes.map((node) => (
                      <span key={node} className="status-chip px-2 py-1">
                        {node}
                      </span>
                    ))}
                  </div>
                  <h3 className="break-words text-xl font-black leading-8">{answer.question.stem}</h3>
                  <div className="grid gap-2">
                    {answer.question.options.map((option) => (
                      <p key={option.key} className="border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold">
                        {option.key}. {option.text}
                      </p>
                    ))}
                  </div>
                  <p className="font-bold text-[var(--muted)]">
                    你的答案 {answer.userAnswer || "未作答"} / 正确答案 {answer.correctAnswer ?? "未配置"}
                  </p>
                  {answer.aiSuggestedScore !== null || answer.kind === "short_answer" || answer.kind === "case_analysis" ? (
                    <div className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
                      <p className="text-sm font-bold text-[var(--muted)]">
                        AI 建议分 {answer.aiSuggestedScore ?? "暂无"} / 用户确认 {answer.userConfirmed ? "已确认" : "未确认"}
                      </p>
                      <form action={confirmAttemptAnswerScoreAction} className="flex flex-wrap items-end gap-2">
                        <input name="attemptId" type="hidden" value={report.id} />
                        <input name="attemptAnswerId" type="hidden" value={answer.id} />
                        <label className="grid gap-1 text-sm font-bold">
                          确认分
                          <input className="w-28 border-2 border-black bg-white px-2 py-1" defaultValue={String(answer.aiSuggestedScore ?? answer.score ?? "")} max={answer.maxScore} min="0" name="score" step="0.5" type="number" />
                        </label>
                        <button className="pixel-button bg-white px-3 py-2 text-sm" type="submit">
                          确认分数
                        </button>
                      </form>
                    </div>
                  ) : null}
                  {answer.explanation ? <p className="border-2 border-black bg-white p-3 leading-7">{answer.explanation}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/practice?retry=${answer.questionId}` as Route} className="pixel-button w-fit bg-white px-4 py-2">
                      重练此题
                    </Link>
                    {answer.isCorrect === true ? (
                      <form action={collectAttemptQuestionAction}>
                        <input name="attemptId" type="hidden" value={report.id} />
                        <input name="attemptAnswerId" type="hidden" value={answer.id} />
                        <input name="questionId" type="hidden" value={answer.questionId} />
                        <button className="pixel-button w-fit bg-white px-4 py-2" type="submit">
                          收藏复习
                        </button>
                      </form>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[var(--surface-subtle)] p-3">
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  );
}

function Feedback({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) {
    return null;
  }

  return (
    <p className={`border-3 border-black p-3 text-sm font-bold ${error ? "bg-red-50 text-red-700" : "bg-[var(--primary)] text-black"}`}>
      {error || notice}
    </p>
  );
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
    .format(value)
    .replaceAll("/", "-");
}
