import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { ConfirmForm } from "@/components/confirm-form";
import { requireWebSession } from "@/lib/auth";
import { getLearningAnalysis } from "@openexam/core/analysis";
import { FeedbackMessage, SubmitButton } from "@openexam/core/pixel-ui";
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
        <FeedbackMessage error={params.error} notice={params.notice} />

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
                <ConfirmForm action={generateStudyPlanAction} buttonLabel={plan ? "重新生成计划" : "生成 14 天计划"} confirmMessage={plan ? "重新生成将归档当前计划并创建新计划，确定继续？" : "将基于当前学习数据生成 14 天计划，确定继续？"} buttonClassName="pixel-button px-4 py-2" />
                {plan ? (
                  <ConfirmForm action={abandonCurrentStudyPlanAction} buttonLabel="放弃当前计划" confirmMessage="放弃后计划将标记为已放弃且无法恢复，确定继续？" />
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
                <div className="h-4 w-full overflow-hidden border-2 border-black bg-[var(--surface-subtle)]">
                  <div
                    className="h-full bg-[var(--teal)] transition-all"
                    style={{ width: `${plan.taskCount > 0 ? Math.round((plan.completedCount / plan.taskCount) * 100) : 0}%` }}
                  />
                </div>

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
                              {(task.knowledgeNodeIds.length > 0 || task.paperId || task.materialId) ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {task.knowledgeNodeIds.slice(0, 3).map((id) => (
                                    <span key={id} className="status-chip bg-[var(--surface-subtle)] px-1.5 py-0.5 text-xs font-bold text-[var(--muted)]">
                                      {id.length > 12 ? `${id.slice(0, 12)}...` : id}
                                    </span>
                                  ))}
                                  {task.knowledgeNodeIds.length > 3 ? (
                                    <span className="status-chip bg-[var(--surface-subtle)] px-1.5 py-0.5 text-xs font-bold text-[var(--muted)]">
                                      +{task.knowledgeNodeIds.length - 3}
                                    </span>
                                  ) : null}
                                  {task.paperId ? <span className="status-chip bg-[var(--surface-subtle)] px-1.5 py-0.5 text-xs font-bold text-[var(--muted)]">试卷</span> : null}
                                  {task.materialId ? <span className="status-chip bg-[var(--surface-subtle)] px-1.5 py-0.5 text-xs font-bold text-[var(--muted)]">资料</span> : null}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-start gap-2">
                              <Link href={task.href as Route} className="pixel-button bg-white px-3 py-2 text-sm">
                                前往
                              </Link>
                              <form action={setStudyPlanTaskCompletedAction}>
                                <input name="taskId" type="hidden" value={task.id} />
                                <input name="completed" type="hidden" value={task.completedAt ? "false" : "true"} />
                                <SubmitButton className="px-3 py-2" label={task.completedAt ? "取消完成" : "标记完成"} />
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
                    <Link key={item.id} href={`/plan/${item.id}` as Route} className="grid gap-3 border-2 border-black bg-white p-3 transition hover:bg-[var(--surface-subtle)] md:grid-cols-[1fr_auto]">
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
                      ) : (
                        <span className="self-center text-sm font-bold text-[var(--muted)]">查看 &rarr;</span>
                      )}
                    </Link>
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
