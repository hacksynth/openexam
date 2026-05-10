import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { FeedbackMessage, SubmitButton } from "@openexam/core/pixel-ui";
import { getStudyPlan } from "@openexam/core/study-plan";
import { setStudyPlanTaskCompletedAction, skipStudyPlanTaskAction } from "../actions";

type PlanDetailPageProps = {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const kindLabels: Record<string, string> = {
  practice: "练习",
  paper: "试卷",
  wrong_note_review: "错题",
  consolidation_review: "巩固",
  knowledge_review: "知识点",
  material_review: "资料"
};

const planStatusLabels: Record<string, string> = {
  active: "进行中",
  archived: "已归档",
  abandoned: "已放弃"
};

const taskStatusLabels: Record<string, string> = {
  pending: "待完成",
  completed: "已完成",
  carried_over: "已顺延",
  skipped: "已跳过"
};

export default async function PlanDetailPage({ params, searchParams }: PlanDetailPageProps) {
  const session = await requireWebSession();
  const [{ planId }, query] = await Promise.all([params, searchParams]);
  const plan = await getStudyPlan(session.user.id, planId);

  if (!plan) {
    return (
      <AppShell section="learner" eyebrow="学习计划" title="计划详情">
        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <h2 className="text-2xl font-black">计划不存在</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">该计划不存在，或不属于当前账号。</p>
          </div>
          <Link href={"/plan" as Route} className="pixel-button w-fit px-4 py-2">
            返回计划
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell section="learner" eyebrow="学习计划" title="计划详情">
      <section className="grid gap-5">
        <FeedbackMessage error={query.error} notice={query.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="status-chip px-2 py-1">{planStatusLabels[plan.status] ?? plan.status}</span>
              <span className="status-chip px-2 py-1">{plan.windowStartDate && plan.windowEndDate ? `${formatDate(plan.windowStartDate)} - ${formatDate(plan.windowEndDate)}` : formatDate(plan.generatedAt)}</span>
              <span className="status-chip px-2 py-1">
                {plan.completedCount} / {plan.taskCount} 已完成
              </span>
            </div>
            <h2 className="break-words text-2xl font-black">{plan.goalPath}</h2>
          </div>
          <div className="h-4 w-full overflow-hidden border-2 border-black bg-[var(--surface-subtle)]">
            <div
              className="h-full bg-[var(--teal)] transition-all"
              style={{ width: `${plan.taskCount > 0 ? Math.round((plan.completedCount / plan.taskCount) * 100) : 0}%` }}
            />
          </div>
          {plan.latestRevision?.note ? <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold text-[var(--muted)]">{plan.latestRevision.note}</p> : null}
          <Link href={"/plan" as Route} className="pixel-button w-fit bg-white px-4 py-2">
            返回计划
          </Link>
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
                        <span className="status-chip px-2 py-1">{formatDate(task.scheduledDate)}</span>
                        <span className={`status-chip px-2 py-1 ${task.status === "completed" ? "bg-[var(--teal)]" : ""}`}>{taskStatusLabels[task.status] ?? task.status}</span>
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
                      {plan.status === "active" ? (
                        <>
                          {task.isCurrentWindowTask && (task.status === "pending" || task.status === "completed") ? (
                            <form action={setStudyPlanTaskCompletedAction}>
                              <input name="taskId" type="hidden" value={task.id} />
                              <input name="completed" type="hidden" value={task.status === "completed" ? "false" : "true"} />
                              <SubmitButton className="px-3 py-2" label={task.status === "completed" ? "取消完成" : "标记完成"} />
                            </form>
                          ) : null}
                          {task.isCurrentWindowTask && task.status === "pending" ? (
                            <form action={skipStudyPlanTaskAction}>
                              <input name="taskId" type="hidden" value={task.id} />
                              <SubmitButton className="bg-white px-3 py-2" label="跳过" />
                            </form>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </section>
    </AppShell>
  );
}

function groupTasksByDay(tasks: NonNullable<Awaited<ReturnType<typeof getStudyPlan>>>["tasks"]) {
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
  }).format(value).replaceAll("/", "-");
}
