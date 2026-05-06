import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getKnowledgeNode } from "@openexam/core/knowledge";
import { FeedbackMessage, SubmitButton, TextareaField } from "@openexam/core/pixel-ui";
import { generateKnowledgeExplanationAction, saveKnowledgeNoteAction } from "../actions";

type KnowledgeNodeDetailPageProps = {
  params: Promise<{ nodeId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const kindLabels: Record<string, string> = {
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  blank: "填空",
  short_answer: "简答",
  case_analysis: "案例"
};

export default async function KnowledgeNodeDetailPage({ params, searchParams }: KnowledgeNodeDetailPageProps) {
  const session = await requireWebSession();
  const [{ nodeId }, query] = await Promise.all([params, searchParams]);
  const node = await getKnowledgeNode(session.user.id, nodeId);

  if (!node) {
    return (
      <AppShell section="learner" eyebrow="知识点" title="知识点详情">
        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <h2 className="text-2xl font-black">知识点不存在</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">该知识点不存在，或不在当前目标范围内。</p>
          </div>
          <Link href={"/knowledge" as Route} className="pixel-button w-fit px-4 py-2">
            返回知识点
          </Link>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell section="learner" eyebrow="知识点" title="知识点详情">
      <section className="grid gap-5">
        <FeedbackMessage error={query.error} notice={query.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="status-chip px-2 py-1">{node.subjectPath}</span>
              {node.code ? <span className="status-chip px-2 py-1">{node.code}</span> : null}
              <span className="status-chip px-2 py-1">正确率 {node.accuracy}%</span>
              {node.pendingWrongNotes > 0 ? (
                <span className="status-chip bg-[var(--danger)] px-2 py-1 text-white">错题 {node.pendingWrongNotes}</span>
              ) : null}
            </div>
            <h2 className="break-words text-2xl font-black">{node.title}</h2>
            {node.description ? <p className="mt-2 leading-7 text-[var(--muted)]">{node.description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/practice?knowledgeNodeId=${encodeURIComponent(node.id)}` as Route} className="pixel-button px-4 py-2">
              练这个知识点
            </Link>
            <Link href={"/knowledge" as Route} className="pixel-button bg-white px-4 py-2">
              返回列表
            </Link>
          </div>
        </section>

        {node.examExpectation ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">Requirements</p>
              <h2 className="mt-1 text-xl font-black">考纲要求</h2>
            </div>
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 leading-7">{node.examExpectation}</p>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="pixel-panel p-4">
            <Metric label="练习次数" value={String(node.recentTotal)} />
          </div>
          <div className="pixel-panel p-4">
            <Metric label="最近正确" value={`${node.recentCorrect} / ${node.recentTotal}`} />
          </div>
        </section>

        {node.commonErrors.length > 0 ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">Common Errors</p>
              <h2 className="mt-1 text-xl font-black">常见错误</h2>
            </div>
            <div className="grid gap-2">
              {node.commonErrors.map((error) => (
                <p key={error} className="border-2 border-black bg-white p-3 text-sm font-bold">
                  {error}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {node.note?.aiExplanation ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">AI Explanation</p>
              <h2 className="mt-1 text-xl font-black">AI 解释</h2>
            </div>
            <p className="border-2 border-black bg-[var(--ai-soft)] p-3 whitespace-pre-line leading-7">{node.note.aiExplanation}</p>
          </section>
        ) : null}

        <section className="pixel-panel grid gap-4 p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <form action={saveKnowledgeNoteAction} className="grid gap-2">
              <input name="knowledgeNodeId" type="hidden" value={node.id} />
              <TextareaField defaultValue={node.note?.note ?? ""} label="我的笔记" name="note" rows={3} />
              <SubmitButton className="w-fit bg-white px-4 py-2" label="保存笔记" />
            </form>
            <form action={generateKnowledgeExplanationAction} className="self-end">
              <input name="knowledgeNodeId" type="hidden" value={node.id} />
              <SubmitButton className="px-4 py-2" label="生成 AI 解释" />
            </form>
          </div>
        </section>

        {node.relatedQuestions.length > 0 ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">Questions</p>
              <h2 className="mt-1 text-xl font-black">关联题目</h2>
            </div>
            <div className="grid gap-3">
              {node.relatedQuestions.map((q) => (
                <Link key={q.id} href={`/practice?retry=${q.id}` as Route} className="flex items-start justify-between gap-3 border-2 border-black bg-white p-3 hover:bg-[var(--surface-subtle)]">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap gap-2">
                      <span className="status-chip px-2 py-1 text-xs">{kindLabels[q.kind] ?? q.kind}</span>
                      {q.difficulty ? <span className="status-chip px-2 py-1 text-xs">难度 {q.difficulty}</span> : null}
                      {q.recentAnswerCorrect !== null ? (
                        <span className={`status-chip px-2 py-1 text-xs ${q.recentAnswerCorrect ? "bg-[var(--teal)]" : "bg-[var(--danger)] text-white"}`}>{q.recentAnswerCorrect ? "最近正确" : "最近错误"}</span>
                      ) : null}
                    </div>
                    <p className="break-words font-bold">{q.stem}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-[var(--muted)]">练习 &rarr;</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <>
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </>
  );
}
