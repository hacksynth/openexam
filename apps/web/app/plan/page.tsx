import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getLearningAnalysis } from "@openexam/core/analysis";
import { getCurrentStudyPlan, listStudyPlanHistory } from "@openexam/core/study-plan";
import { abandonCurrentStudyPlanAction, generateStudyPlanAction, setStudyPlanTaskCompletedAction } from "./actions";

type PlanPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const kindLabels: Record<string, string> = {
  practice: "练习",
  paper: "试卷",
  wrong_note_review: "错题",
  knowledge_review: "知识点",
  material_review: "资料"
};

const planStatusLabels: Record<string, string> = {
  active: "进行中",
  archived: "已归档",
  abandoned: "已放弃"
};

export default async function PlanPage({ searchParams }: PlanPageProps) {
  const session = await requireWebSession();
  const [params, analysis, plan, planHistory] = await Promise.all([
    searchParams,
    getLearningAnalysis(session.user.id),
    getCurrentStudyPlan(session.user.id),
    listStudyPlanHistory(session.user.id)
  ]);

  return (
    <AppShell section="learner" eyebrow="学习计划" title="学习计划">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        {analysis.status === "no_goal" ? (
          <EmptyState title="请先设置考试目标" description="学习计划会围绕当前主目标生成。" href="/goals" action="设置目标" />
        ) : (
          <>
            <section className="pixel-panel grid gap-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase text-[var(--muted)]">14-Day Plan</p>
                <h2 className="mt-1 break-words text-2xl font-black">{plan ? `${plan.goalPath}` : "尚未生成学习计划"}</h2>
                <p className="mt-1 font-bold text-[var(--muted)]">
                  当前数据：作答 {analysis.summary.totalQuestions} 题，正确率 {analysis.summary.accuracy}%，未掌握错题 {analysis.summary.pendingWrongNotes}。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <form action={generateStudyPlanAction}>
                  <button className="pixel-button px-4 py-2" type="submit">
                    {plan ? "重新生成计划" : "生成 14 天计划"}
                  </button>
                </form>
                {plan ? (
                  <form action={abandonCurrentStudyPlanAction}>
                    <button className="pixel-button bg-white px-4 py-2" type="submit">
                      放弃当前计划
                    </button>
                  </form>
                ) : null}
                <Link href={"/analysis" as Route} className="pixel-button bg-white px-4 py-2">
                  查看分析
                </Link>
              </div>
            </section>

            {!plan ? (
              <EmptyState title="暂无计划" description="配置 OpenAI Key 后，可基于当前练习、错题和薄弱知识点生成结构化计划。" href="/profile" action="配置 AI Key" />
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-3">
                  <Metric label="任务完成" value={`${plan.completedCount} / ${plan.taskCount}`} />
                  <Metric label="生成日期" value={formatDate(plan.generatedAt)} />
                  <Metric label="计划状态" value={planStatusLabels[plan.status] ?? plan.status} />
                </section>

                <section className="grid gap-4">
                  {groupTasksByDay(plan.tasks).map((day) => (
                    <article key={day.day} className="pixel-panel grid gap-4 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl font-black">第 {day.day} 天</h2>
                        <span className="status-chip px-2 py-1">{day.tasks.reduce((sum, task) => sum + task.minutes, 0)} 分钟</span>
                      </div>
                      <div className="grid gap-3">
                        {day.tasks.map((task) => (
                          <div key={task.id} className="grid gap-3 border-2 border-black bg-white p-3 lg:grid-cols-[1fr_auto]">
                            <div className="min-w-0">
                              <div className="mb-2 flex flex-wrap gap-2">
                                <span className="status-chip px-2 py-1">{kindLabels[task.kind] ?? task.kind}</span>
                                <span className="status-chip px-2 py-1">{task.minutes} 分钟</span>
                                {task.completedAt ? <span className="status-chip bg-[var(--teal)] px-2 py-1">已完成</span> : null}
                              </div>
                              <h3 className="break-words text-lg font-black">{task.title}</h3>
                            </div>
                            <div className="flex flex-wrap items-start gap-2">
                              <Link href={task.href as Route} className="pixel-button bg-white px-3 py-2 text-sm">
                                前往
                              </Link>
                              <form action={setStudyPlanTaskCompletedAction}>
                                <input name="taskId" type="hidden" value={task.id} />
                                <input name="completed" type="hidden" value={task.completedAt ? "false" : "true"} />
                                <button className="pixel-button px-3 py-2 text-sm" type="submit">
                                  {task.completedAt ? "取消完成" : "标记完成"}
                                </button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </section>
              </>
            )}

            {planHistory.length > 0 ? (
              <section className="pixel-panel grid gap-4 p-5">
                <div>
                  <p className="text-xs font-bold uppercase text-[var(--muted)]">History</p>
                  <h2 className="mt-1 text-xl font-black">计划历史</h2>
                </div>
                <div className="grid gap-3">
                  {planHistory.map((item) => (
                    <article key={item.id} className="grid gap-3 border-2 border-black bg-white p-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          <span className="status-chip px-2 py-1">{planStatusLabels[item.status] ?? item.status}</span>
                          <span className="status-chip px-2 py-1">{formatDate(item.generatedAt)}</span>
                          <span className="status-chip px-2 py-1">
                            {item.completedCount} / {item.taskCount}
                          </span>
                        </div>
                        <p className="break-words font-black">{item.goalPath}</p>
                      </div>
                      {item.status === "active" ? (
                        <span className="status-chip self-start bg-[var(--teal)] px-2 py-1">当前</span>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}

function Feedback({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) {
    return null;
  }

  return <p className={`border-3 border-black p-3 text-sm font-bold ${error ? "bg-red-50 text-red-700" : "bg-[var(--primary)] text-black"}`}>{error || notice}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="pixel-panel p-4">
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
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

function groupTasksByDay(tasks: NonNullable<Awaited<ReturnType<typeof getCurrentStudyPlan>>>["tasks"]) {
  const days = new Map<number, typeof tasks>();

  for (const task of tasks) {
    days.set(task.day, [...(days.get(task.day) ?? []), task]);
  }

  return [...days.entries()].map(([day, items]) => ({ day, tasks: items }));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit"
  })
    .format(value)
    .replaceAll("/", "-");
}
