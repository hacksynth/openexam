import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getPaperForAttempt } from "@openexam/core/papers";
import { submitPaperAttemptAction } from "../actions";

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

            <form action={submitPaperAttemptAction} className="grid gap-4">
              <input name="paperId" type="hidden" value={state.paper.id} />
              {state.paper.questions.map((question) => (
                <section key={question.id} className="pixel-panel grid gap-4 p-5">
                  <input name="questionId" type="hidden" value={question.id} />
                  <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className="status-chip px-2 py-1">第 {question.number} 题</span>
                      <span className="status-chip px-2 py-1">{question.score} 分</span>
                      {question.section ? <span className="status-chip px-2 py-1">{question.section}</span> : null}
                      {question.knowledgeNodes.map((node) => (
                        <span key={node} className="status-chip px-2 py-1">
                          {node}
                        </span>
                      ))}
                    </div>
                    <h3 className="break-words text-xl font-black leading-8">{question.stem}</h3>
                  </div>
                  <div className="grid gap-3">
                    {question.options.map((option) => (
                      <label key={option.key} className="flex min-w-0 gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold">
                        <input className="mt-1 h-5 w-5 shrink-0 accent-black" name={`answer_${question.id}`} type="radio" value={option.key} />
                        <span className="min-w-0 break-words">
                          {option.key}. {option.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              <div className="pixel-panel flex flex-wrap gap-3 p-5">
                <button className="pixel-button px-4 py-2" type="submit">
                  提交试卷
                </button>
                <Link href={"/papers" as Route} className="pixel-button bg-white px-4 py-2">
                  返回试卷
                </Link>
              </div>
            </form>
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
