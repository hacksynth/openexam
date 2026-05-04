import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { currentGoal, dashboardMetrics, recentJobs, todayTasks, weakKnowledgeNodes } from "@/lib/dashboard-data";

export default function DashboardPage() {
  return (
    <AppShell section="learner" eyebrow="learner foundation" title="Dashboard">
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
              <p className="text-xs font-bold uppercase text-[var(--muted)]">Current Exam Goal</p>
              <h2 className="mt-2 text-2xl font-black">
                {currentGoal.program} / {currentGoal.track}
              </h2>
              <p className="mt-1 font-bold text-[var(--muted)]">
                {currentGoal.cycle} / target {currentGoal.targetDate} / {currentGoal.dailyMinutes} min daily
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/practice" className="pixel-button px-4 py-2">
                Continue Practice
              </Link>
              <Link href="/wrong-notes" className="pixel-button bg-white px-4 py-2">
                Review Wrong Notes
              </Link>
            </div>
          </section>

          <section className="pixel-panel p-5">
            <h2 className="mb-4 text-xl font-black">Today</h2>
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
            <h2 className="mb-4 text-xl font-black">Weak Knowledge Points</h2>
            <div className="flex flex-wrap gap-2">
              {weakKnowledgeNodes.map((node) => (
                <span key={node} className="status-chip px-2 py-1">
                  {node}
                </span>
              ))}
            </div>
          </section>

          <section className="pixel-panel p-5">
            <h2 className="mb-4 text-xl font-black">AI And Import Jobs</h2>
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
