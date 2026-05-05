import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getLearningAnalysis } from "@openexam/core/analysis";

export default async function AnalysisPage() {
  const session = await requireWebSession();
  const state = await getLearningAnalysis(session.user.id);

  return (
    <AppShell section="learner" eyebrow="学习分析" title="学习分析">
      <section className="grid gap-5">
        {state.status === "no_goal" ? (
          <EmptyState title="请先设置考试目标" description="学习分析会按当前主目标统计练习、试卷和错题。" href="/goals" action="设置目标" />
        ) : (
          <>
            <section className="pixel-panel grid gap-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase text-[var(--muted)]">当前目标</p>
                <h2 className="mt-1 break-words text-2xl font-black">{state.goalPath}</h2>
                <p className="mt-1 font-bold text-[var(--muted)]">分析基于最近 50 次作答和当前目标范围内的错题。</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={"/practice" as Route} className="pixel-button px-4 py-2">
                  开始练习
                </Link>
                <Link href={"/plan" as Route} className="pixel-button bg-white px-4 py-2">
                  生成计划
                </Link>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-4">
              <Metric label="作答题数" value={String(state.summary.totalQuestions)} />
              <Metric label="正确率" value={`${state.summary.accuracy}%`} />
              <Metric label="得分率" value={`${state.summary.scoreRate}%`} />
              <Metric label="未掌握错题" value={String(state.summary.pendingWrongNotes)} />
            </section>

            {state.summary.totalQuestions === 0 ? (
              <EmptyState title="暂无学习数据" description="完成单题练习或试卷后，这里会显示薄弱知识点和最近作答。" href="/practice" action="开始练习" />
            ) : (
              <>
                <section className="pixel-panel grid gap-4 p-5">
                  <div>
                    <p className="text-xs font-bold uppercase text-[var(--muted)]">Weak Points</p>
                    <h2 className="mt-1 text-xl font-black">薄弱知识点</h2>
                  </div>
                  {state.summary.weakKnowledgeNodes.length === 0 ? (
                    <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">暂无知识点统计。</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {state.summary.weakKnowledgeNodes.map((node) => (
                        <article key={node.id} className="border-2 border-black bg-[var(--surface-subtle)] p-3">
                          <h3 className="break-words text-lg font-black">{node.title}</h3>
                          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
                            正确 {node.correct} / {node.total}，正确率 {node.accuracy}%，未掌握错题 {node.pendingWrongNotes}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="pixel-panel grid gap-4 p-5">
                  <div>
                    <p className="text-xs font-bold uppercase text-[var(--muted)]">Recent</p>
                    <h2 className="mt-1 text-xl font-black">最近作答</h2>
                  </div>
                  <div className="grid gap-3">
                    {state.recentAttempts.map((attempt) => (
                      <Link key={attempt.id} href={`/attempts/${attempt.id}` as Route} className="border-2 border-black bg-white p-3 hover:bg-[var(--primary)]">
                        <span className="block break-words font-black">{attempt.title}</span>
                        <span className="mt-1 block text-sm font-bold text-[var(--muted)]">
                          {attempt.kind === "paper" ? "试卷" : "练习"} / 得分 {attempt.totalScore} / {attempt.maxScore} / {formatDateTime(attempt.submittedAt)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="pixel-panel p-4">
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-4xl font-black">{value}</p>
    </article>
  );
}

function EmptyState({ title, description, href, action }: { title: string; description: string; href: Route; action: string }) {
  return (
    <section className="pixel-panel grid gap-4 p-5">
      <div>
        <h2 className="text-2xl font-black">{title}</h2>
        <p className="mt-1 font-bold text-[var(--muted)]">{description}</p>
      </div>
      <Link href={href} className="pixel-button w-fit px-4 py-2">
        {action}
      </Link>
    </section>
  );
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "未提交";
  }

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
