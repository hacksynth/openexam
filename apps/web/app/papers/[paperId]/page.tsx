import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getPaperForAttempt } from "@openexam/core/papers";
import { PaperAttemptForm } from "./paper-attempt-form";

type PaperAttemptPageProps = {
  params: Promise<{ paperId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function PaperAttemptPage({ params, searchParams }: PaperAttemptPageProps) {
  const session = await requireWebSession();
  const [{ paperId }, query] = await Promise.all([params, searchParams]);
  const state = await getPaperForAttempt(session.user.id, paperId);

  return (
    <AppShell section="learner" eyebrow="试卷作答" title="试卷">
      <section className="grid gap-5">
        <Feedback error={query.error} />
        {state.status === "no_goal" ? (
          <EmptyState title="请先设置考试目标" description="设置目标后才能进入匹配的公开试卷。" href="/goals" action="设置目标" />
        ) : state.status === "empty" ? (
          <EmptyState title={state.error} description="返回试卷列表选择当前目标下可用的公开试卷。" href="/papers" action="返回试卷" />
        ) : (
          <>
            <section className="pixel-panel grid gap-4 p-5">
              <div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{state.paper.questions.length} 题</span>
                  <span className="status-chip px-2 py-1">{state.paper.totalScore} 分</span>
                </div>
                <h2 className="break-words text-2xl font-black leading-9">{state.paper.title}</h2>
                <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{state.paper.subjectPath}</p>
              </div>
            </section>

            <PaperAttemptForm paper={state.paper} />
          </>
        )}
      </section>
    </AppShell>
  );
}

function Feedback({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="border-3 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>;
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
