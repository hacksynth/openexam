import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { flattenKnowledgeTree, getKnowledgeNode } from "@openexam/core/knowledge";
import { FeedbackMessage, StatusChip, SubmitButton, TextareaField } from "@openexam/core/pixel-ui";
import { generateKnowledgeExplanationAction, saveKnowledgeNoteAction } from "../actions";

type KnowledgeNodeDetailPageProps = {
  params: Promise<{ nodeId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

type KnowledgeNodeDetail = NonNullable<Awaited<ReturnType<typeof getKnowledgeNode>>>;
type KnowledgeTreeRow = KnowledgeNodeDetail["subtree"];

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

  const treeRows = flattenKnowledgeTree([node.subtree]);

  return (
    <AppShell section="learner" eyebrow="知识点" title="知识点详情">
      <section className="grid gap-5">
        <FeedbackMessage error={query.error} notice={query.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <StatusChip>{node.subjectPath}</StatusChip>
              {node.code ? <StatusChip>{node.code}</StatusChip> : null}
              <StatusChip>题量 {node.questionCount}</StatusChip>
              <StatusChip>新题 {node.newQuestionCount}</StatusChip>
              <StatusChip>已练 {node.practicedQuestionCount}</StatusChip>
              <StatusChip>正确率 {accuracyLabel(node)}</StatusChip>
              {node.pendingWrongNotes > 0 ? (
                <StatusChip tone="danger">错题 {node.pendingWrongNotes}</StatusChip>
              ) : null}
            </div>
            <h2 className="break-words text-2xl font-black">{node.title}</h2>
            <p className="mt-2 break-words text-sm font-bold text-[var(--muted)]">{node.knowledgePath}</p>
            {node.description ? <p className="mt-2 leading-7 text-[var(--muted)]">{node.description}</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            {node.questionCount > 0 ? (
              <Link href={`/practice?mode=new&knowledgeNodeId=${encodeURIComponent(node.id)}` as Route} className="pixel-button px-4 py-2">
                练新题
              </Link>
            ) : null}
            {node.pendingWrongNotes > 0 ? (
              <Link href={`/practice?mode=wrong&knowledgeNodeId=${encodeURIComponent(node.id)}` as Route} className="pixel-button bg-white px-4 py-2">
                练错题
              </Link>
            ) : null}
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

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Knowledge Tree</p>
            <h2 className="mt-1 text-xl font-black">范围结构</h2>
          </div>
          <div className="grid gap-2">
            {treeRows.map((item) => (
              <KnowledgeTreeItemRow currentNodeId={node.id} item={item} key={item.id} rootDepth={node.subtree.depth} />
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="pixel-panel p-4">
            <Metric label="新题" value={String(node.newQuestionCount)} />
          </div>
          <div className="pixel-panel p-4">
            <Metric label="正确/已练" value={`${node.recentCorrect} / ${node.practicedQuestionCount}`} />
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
                <Link key={q.id} href={`/practice?question=${q.id}&knowledgeNodeId=${encodeURIComponent(node.id)}` as Route} className="flex items-start justify-between gap-3 border-2 border-black bg-white p-3 hover:bg-[var(--surface-subtle)]">
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

function KnowledgeTreeItemRow({ currentNodeId, item, rootDepth }: { currentNodeId: string; item: KnowledgeTreeRow; rootDepth: number }) {
  const isCurrent = item.id === currentNodeId;

  return (
    <div
      className={`grid gap-3 border-2 border-black p-3 lg:grid-cols-[1fr_auto] ${isCurrent ? "bg-white" : "bg-[var(--surface-subtle)]"}`}
      style={{ marginLeft: `${Math.min(Math.max(0, item.depth - rootDepth), 6) * 0.75}rem` }}
    >
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-2">
          {item.code ? <StatusChip className="text-xs">{item.code}</StatusChip> : null}
          {isCurrent ? <StatusChip className="text-xs" tone="warning">当前</StatusChip> : null}
          <StatusChip className="text-xs">题量 {item.questionCount}</StatusChip>
          {item.descendantCount > 0 ? <StatusChip className="text-xs">子项 {item.descendantCount}</StatusChip> : null}
          <StatusChip className="text-xs">新题 {item.newQuestionCount}</StatusChip>
          <StatusChip className="text-xs">已练 {item.practicedQuestionCount}</StatusChip>
          <StatusChip className="text-xs">正确率 {accuracyLabel(item)}</StatusChip>
          {item.pendingWrongNotes > 0 ? (
            <StatusChip className="text-xs" tone="danger">
              错题 {item.pendingWrongNotes}
            </StatusChip>
          ) : null}
        </div>
        <h3 className="break-words font-black">{item.title}</h3>
      </div>
      <div className="flex flex-wrap gap-2 self-start">
        {item.questionCount > 0 ? (
          <Link href={`/practice?mode=new&knowledgeNodeId=${encodeURIComponent(item.id)}` as Route} className="pixel-button h-fit whitespace-nowrap px-3 py-2 text-sm">
            练新题
          </Link>
        ) : null}
        {item.pendingWrongNotes > 0 ? (
          <Link href={`/practice?mode=wrong&knowledgeNodeId=${encodeURIComponent(item.id)}` as Route} className="pixel-button h-fit whitespace-nowrap bg-white px-3 py-2 text-sm">
            练错题
          </Link>
        ) : null}
        {!isCurrent ? (
          <Link href={`/knowledge/${encodeURIComponent(item.id)}` as Route} className="pixel-button h-fit whitespace-nowrap bg-white px-3 py-2 text-sm">
            详情
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function accuracyLabel(node: Pick<KnowledgeNodeDetail, "accuracy" | "practicedQuestionCount">) {
  return node.practicedQuestionCount > 0 ? `${node.accuracy}%` : "未练";
}
