import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getKnowledgeDashboard } from "@openexam/core/knowledge";
import { generateKnowledgeExplanationAction, saveKnowledgeNoteAction } from "./actions";

type KnowledgePageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const session = await requireWebSession();
  const [params, state] = await Promise.all([searchParams, getKnowledgeDashboard(session.user.id)]);

  return (
    <AppShell section="learner" eyebrow="知识点" title="知识点">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        {state.status === "no_goal" ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <h2 className="text-2xl font-black">请先设置考试目标</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">设置主目标后，这里会显示目标范围内的知识树和练习压力。</p>
            </div>
            <Link href={"/goals" as Route} className="pixel-button w-fit px-4 py-2">
              设置目标
            </Link>
          </section>
        ) : (
          <>
            <section className="pixel-panel grid gap-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase text-[var(--muted)]">当前目标</p>
                <h2 className="mt-1 text-2xl font-black">{state.goalPath}</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="知识点" value={String(state.nodes.length)} />
                <Metric label="关联题" value={String(state.nodes.reduce((sum, node) => sum + node.questionCount, 0))} />
                <Metric label="待复习" value={String(state.nodes.reduce((sum, node) => sum + node.pendingWrongNotes, 0))} />
                <Metric label="已练记录" value={String(state.nodes.reduce((sum, node) => sum + node.recentTotal, 0))} />
              </div>
            </section>

            <section className="grid gap-4">
              {state.nodes.map((node) => (
                <article key={node.id} className="pixel-panel grid gap-4 p-5">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className="status-chip px-2 py-1">{node.subjectPath}</span>
                        {node.code ? <span className="status-chip px-2 py-1">{node.code}</span> : null}
                        <span className="status-chip px-2 py-1">题 {node.questionCount}</span>
                        <span className="status-chip px-2 py-1">正确率 {node.accuracy}%</span>
                        {node.pendingWrongNotes ? <span className="status-chip bg-[var(--danger)] px-2 py-1 text-white">错题 {node.pendingWrongNotes}</span> : null}
                      </div>
                      <h2 className="break-words text-xl font-black leading-8">{node.title}</h2>
                      {node.description ? <p className="mt-2 leading-7 text-[var(--muted)]">{node.description}</p> : null}
                    </div>
                    <Link href={`/practice?knowledgeNodeId=${encodeURIComponent(node.id)}` as Route} className="pixel-button h-fit whitespace-nowrap px-4 py-2">
                      练这个知识点
                    </Link>
                  </div>

                  {node.examExpectation ? (
                    <div className="border-2 border-black bg-[var(--surface-subtle)] p-3">
                      <p className="text-sm font-bold text-[var(--muted)]">考试要求</p>
                      <p className="mt-1 leading-7">{node.examExpectation}</p>
                    </div>
                  ) : null}

                  {node.commonErrors.length > 0 ? (
                    <div className="border-2 border-black bg-white p-3">
                      <p className="text-sm font-bold text-[var(--muted)]">常见错误</p>
                      <div className="mt-2 grid gap-2">
                        {node.commonErrors.map((error) => (
                          <p key={error} className="break-words text-sm font-bold">
                            {error}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {node.note?.aiExplanation ? (
                    <div className="border-2 border-black bg-[var(--ai-soft)] p-3">
                      <p className="text-sm font-bold text-[var(--muted)]">AI 解释</p>
                      <p className="mt-1 whitespace-pre-line leading-7">{node.note.aiExplanation}</p>
                    </div>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <form action={saveKnowledgeNoteAction} className="grid gap-2">
                      <input name="knowledgeNodeId" type="hidden" value={node.id} />
                      <label className="grid gap-2 text-sm font-bold">
                        我的笔记
                        <textarea className="border-3 border-black bg-white px-3 py-2" defaultValue={node.note?.note ?? ""} name="note" rows={3} />
                      </label>
                      <button className="pixel-button w-fit bg-white px-4 py-2" type="submit">
                        保存笔记
                      </button>
                    </form>
                    <form action={generateKnowledgeExplanationAction} className="self-end">
                      <input name="knowledgeNodeId" type="hidden" value={node.id} />
                      <button className="pixel-button px-4 py-2" type="submit">
                        生成 AI 解释
                      </button>
                    </form>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[var(--surface-subtle)] p-3">
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  );
}

function Feedback({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) {
    return null;
  }

  return (
    <p className={`border-3 border-black p-3 text-sm font-bold ${error ? "bg-red-50 text-red-700" : "bg-[var(--primary)] text-black"}`}>
      {error || notice}
    </p>
  );
}
