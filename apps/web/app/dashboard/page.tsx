import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { dashboardMetrics, recentJobs, todayTasks, weakKnowledgeNodes } from "@openexam/core/dashboard-data";
import { formatDateInput, formatGoalPath, getPrimaryExamGoal } from "@openexam/core/exam-core";

export default async function DashboardPage() {
  const session = await requireWebSession();
  const currentGoal = await getPrimaryExamGoal(session.user.id);

  return (
    <AppShell section="learner" eyebrow="学习端基础版" title="仪表盘">
      <section className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-4">
          {dashboardMetrics.map((metric) => (
            <article key={metric.label} className="pixel-panel p-4">
              <p className="text-xs font-bold uppercase text-[var(--muted)]">{metric.label}</p>
              <p className="mt-2 text-4xl font-black">{metric.value}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">当前考试目标</p>
              {currentGoal ? (
                <>
                  <h2 className="mt-2 text-2xl font-black">{formatGoalPath(currentGoal)}</h2>
                  <p className="mt-1 font-bold text-[var(--muted)]">
                    目标日期 {formatDateInput(currentGoal.targetDate) || "未设置"} / 目标分 {currentGoal.targetScore ?? "未设置"} / 每日 {currentGoal.dailyMinutes} 分钟
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-2 text-2xl font-black">尚未选择考试目标</h2>
                  <p className="mt-1 font-bold text-[var(--muted)]">先设置主目标，后续练习、分析和计划都会围绕它展开。</p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/goals" className="pixel-button px-4 py-2">
                {currentGoal ? "调整目标" : "选择目标"}
              </Link>
              <Link href="/wrong-notes" className="pixel-button bg-white px-4 py-2">
                复习错题
              </Link>
            </div>
          </section>

          <section className="pixel-panel p-5">
            <h2 className="mb-4 text-xl font-black">今日安排</h2>
            <ol className="grid gap-3">
              {todayTasks.map((task) => (
                <li key={task} className="border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold">
                  {task}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="pixel-panel p-5">
            <h2 className="mb-4 text-xl font-black">薄弱知识点</h2>
            <div className="flex flex-wrap gap-2">
              {weakKnowledgeNodes.map((node) => (
                <span key={node} className="status-chip px-2 py-1">
                  {node}
                </span>
              ))}
            </div>
          </section>

          <section className="pixel-panel p-5">
            <h2 className="mb-4 text-xl font-black">AI 与导入任务</h2>
            <div className="grid gap-3">
              {recentJobs.map((job) => (
                <div key={job.label} className="flex items-center justify-between border-2 border-black bg-white p-3">
                  <span className="font-bold">{job.label}</span>
                  <span className="status-chip px-2 py-1">{job.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
