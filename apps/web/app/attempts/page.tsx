import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { listAttempts } from "@openexam/core/practice";

const statusLabels: Record<string, string> = {
  in_progress: "进行中",
  paused: "已暂停",
  submitted: "已提交",
  graded: "已评分",
  abandoned: "已放弃"
};

export default async function AttemptsPage() {
  const session = await requireWebSession();
  const attempts = await listAttempts(session.user.id);

  return (
    <AppShell section="learner" eyebrow="练习闭环" title="作答记录">
      <section className="grid gap-5">
        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Attempts</p>
            <h2 className="mt-2 text-2xl font-black">最近 {attempts.length} 次作答</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">这里记录练习提交、得分、答案、解析和关联知识点。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={"/practice" as Route} className="pixel-button px-4 py-2">
              开始练习
            </Link>
            <Link href={"/wrong-notes" as Route} className="pixel-button bg-white px-4 py-2">
              查看错题本
            </Link>
          </div>
        </section>

        {attempts.length === 0 ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <h2 className="text-2xl font-black">暂无作答记录</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">完成一次练习后，记录会出现在这里。</p>
            </div>
            <Link href={"/practice" as Route} className="pixel-button w-fit px-4 py-2">
              去练习
            </Link>
          </section>
        ) : (
          <section className="grid gap-4">
            {attempts.map((attempt) => (
              <article key={attempt.id} className="pixel-panel grid gap-4 p-5">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="status-chip px-2 py-1">{statusLabels[attempt.status] ?? attempt.status}</span>
                      <span className="status-chip px-2 py-1">得分 {attempt.totalScore} / {attempt.maxScore}</span>
                      <span className="status-chip px-2 py-1">{formatDateTime(attempt.submittedAt ?? attempt.startedAt)}</span>
                    </div>
                    <h2 className="break-words text-xl font-black leading-8">{attempt.goalPath}</h2>
                  </div>
                  <Link href={"/practice" as Route} className="pixel-button h-fit whitespace-nowrap px-4 py-2">
                    继续练习
                  </Link>
                </div>

                <div className="grid gap-3">
                  {attempt.answers.map((answer) => (
                    <section key={answer.id} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
                      <div className="flex flex-wrap gap-2">
                        <span className={`status-chip px-2 py-1 ${answer.isCorrect ? "bg-[var(--teal)]" : "bg-[var(--danger)] text-white"}`}>
                          {answer.isCorrect ? "正确" : "错误"}
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
                      <h3 className="break-words text-lg font-black leading-7">{answer.question.stem}</h3>
                      <p className="font-bold text-[var(--muted)]">
                        你的答案 {answer.userAnswer || "未记录"} / 正确答案 {answer.correctAnswer ?? "未配置"}
                      </p>
                      {answer.explanation ? <p className="border-2 border-black bg-white p-3 leading-7">{answer.explanation}</p> : null}
                      <Link href={`/practice?retry=${answer.questionId}` as Route} className="pixel-button w-fit bg-white px-4 py-2">
                        重练此题
                      </Link>
                    </section>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </AppShell>
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
