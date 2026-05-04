import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { listWrongNotes } from "@openexam/core/practice";
import { setWrongNoteMasteredAction } from "./actions";

type WrongNotesPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function WrongNotesPage({ searchParams }: WrongNotesPageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const notes = await listWrongNotes(session.user.id);
  const pendingCount = notes.filter((note) => !note.mastered).length;

  return (
    <AppShell section="learner" eyebrow="练习闭环" title="错题本">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">错题本</p>
            <h2 className="mt-2 text-2xl font-black">待复习 {pendingCount} 题</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">练习中答错的题会自动进入错题本，可手动切换掌握状态。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={"/practice" as Route} className="pixel-button px-4 py-2">
              开始练习
            </Link>
            <Link href={"/dashboard" as Route} className="pixel-button bg-white px-4 py-2">
              返回仪表盘
            </Link>
          </div>
        </section>

        {notes.length === 0 ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <h2 className="text-2xl font-black">暂无错题</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">提交错误答案后，这里会显示题目、正确答案、解析和关联知识点。</p>
            </div>
            <Link href={"/practice" as Route} className="pixel-button w-fit px-4 py-2">
              去练习
            </Link>
          </section>
        ) : (
          <section className="grid gap-4">
            {notes.map((note) => (
              <article key={note.id} className="pixel-panel grid gap-4 p-5">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap gap-2">
                      <span className={`status-chip px-2 py-1 ${note.mastered ? "bg-[var(--teal)]" : "bg-[var(--danger)] text-white"}`}>
                        {note.mastered ? "已掌握" : "未掌握"}
                      </span>
                      <span className="status-chip px-2 py-1">错误 {note.errorCount} 次</span>
                      <span className="status-chip px-2 py-1">更新 {formatDate(note.updatedAt)}</span>
                    </div>
                    <h2 className="break-words text-xl font-black leading-8">{note.stem}</h2>
                  </div>
                  <form action={setWrongNoteMasteredAction} className="self-start">
                    <input name="wrongNoteId" type="hidden" value={note.id} />
                    <input name="mastered" type="hidden" value={note.mastered ? "false" : "true"} />
                    <button className="pixel-button whitespace-nowrap px-4 py-2" type="submit">
                      {note.mastered ? "标记未掌握" : "标记已掌握"}
                    </button>
                  </form>
                </div>

                <div className="flex flex-wrap gap-2">
                  {note.knowledgeNodes.map((node) => (
                    <span key={node} className="status-chip px-2 py-1">
                      {node}
                    </span>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                  <div className="border-2 border-black bg-[var(--surface-subtle)] p-3">
                    <p className="text-sm font-bold text-[var(--muted)]">正确答案</p>
                    <p className="mt-1 text-2xl font-black">{note.correctAnswer ?? "未配置"}</p>
                  </div>
                  {note.explanation ? (
                    <div className="border-2 border-black bg-white p-3">
                      <p className="text-sm font-bold text-[var(--muted)]">解析</p>
                      <p className="mt-1 leading-7">{note.explanation}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        )}
      </section>
    </AppShell>
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

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(value)
    .replaceAll("/", "-");
}
