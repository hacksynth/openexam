import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { listAvailablePapers } from "@openexam/core/papers";

const paperTypeLabels: Record<string, string> = {
  sample: "样例卷",
  mock: "模拟卷",
  past: "真题卷",
  practice: "练习卷"
};

export default async function PapersPage() {
  const session = await requireWebSession();
  const state = await listAvailablePapers(session.user.id);

  return (
    <AppShell section="learner" eyebrow="正式作答" title="试卷">
      <section className="grid gap-5">
        {state.status === "no_goal" ? (
          <EmptyState title="请先设置考试目标" description="试卷会按你的考试项目、方向、批次和科目筛选。" href="/goals" action="设置目标" />
        ) : (
          <>
            <section className="pixel-panel grid gap-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase text-[var(--muted)]">Papers</p>
                <h2 className="mt-2 text-2xl font-black">可作答试卷</h2>
                <p className="mt-1 font-bold text-[var(--muted)]">当前目标下的公开试卷会显示在这里。</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={"/attempts" as Route} className="pixel-button bg-white px-4 py-2">
                  作答记录
                </Link>
                <Link href={"/practice" as Route} className="pixel-button bg-white px-4 py-2">
                  单题练习
                </Link>
              </div>
            </section>

            {state.papers.length === 0 ? (
              <EmptyState title="暂无可用试卷" description="当前目标还没有公开试卷，先使用单题练习保持节奏。" href="/practice" action="开始练习" />
            ) : (
              <section className="grid gap-4 md:grid-cols-2">
                {state.papers.map((paper) => (
                  <article key={paper.id} className="pixel-panel grid gap-4 p-5">
                    <div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className="status-chip px-2 py-1">{paperTypeLabels[paper.paperType] ?? paper.paperType}</span>
                        <span className="status-chip px-2 py-1">{paper.questionCount} 题</span>
                        <span className="status-chip px-2 py-1">{paper.totalScore} 分</span>
                      </div>
                      <h2 className="break-words text-xl font-black leading-8">{paper.title}</h2>
                      <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{paper.subjectPath}</p>
                    </div>
                    <Link href={`/papers/${paper.id}` as Route} className="pixel-button w-fit px-4 py-2">
                      开始作答
                    </Link>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}

function EmptyState({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return (
    <section className="pixel-panel grid gap-4 p-5">
      <div>
        <h2 className="text-2xl font-black">{title}</h2>
        <p className="mt-1 font-bold text-[var(--muted)]">{description}</p>
      </div>
      <Link href={href as Route} className="pixel-button w-fit px-4 py-2">
        {action}
      </Link>
    </section>
  );
}
