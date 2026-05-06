import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getKnowledgeDashboard } from "@openexam/core/knowledge";
import { FeedbackMessage, StatusChip } from "@openexam/core/pixel-ui";

type KnowledgePageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

type ReadyKnowledgeDashboard = Extract<Awaited<ReturnType<typeof getKnowledgeDashboard>>, { status: "ready" }>;
type KnowledgeTreeNode = ReadyKnowledgeDashboard["tree"][number];

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const session = await requireWebSession();
  const [params, state] = await Promise.all([searchParams, getKnowledgeDashboard(session.user.id)]);
  const nodeGroups = state.status === "ready" ? groupKnowledgeTree(state.tree) : [];

  return (
    <AppShell section="learner" eyebrow="知识点" title="知识点">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

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
              <div className="grid gap-3 md:grid-cols-5">
                <Metric label="大项" value={String(state.tree.length)} />
                <Metric label="知识点" value={String(state.nodes.length)} />
                <Metric label="新题" value={String(sumRootMetric(state.tree, "newQuestionCount"))} />
                <Metric label="待复习" value={String(sumRootMetric(state.tree, "pendingWrongNotes"))} />
                <Metric label="已练" value={String(sumRootMetric(state.tree, "practicedQuestionCount"))} />
              </div>
            </section>

            <section className="grid gap-6">
              {nodeGroups.length === 0 ? (
                <p className="pixel-panel p-5 text-sm font-bold text-[var(--muted)]">暂无知识点。</p>
              ) : null}
              {nodeGroups.map((group) => (
                <section key={group.subjectPath} className="grid gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-[var(--muted)]">Subject</p>
                    <h2 className="mt-1 text-xl font-black">{group.subjectPath}</h2>
                  </div>
                  {group.roots.map((node) => (
                    <KnowledgeAreaCard key={node.id} node={node} />
                  ))}
                </section>
              ))}
            </section>
          </>
        )}
      </section>
    </AppShell>
  );
}

function KnowledgeAreaCard({ node }: { node: KnowledgeTreeNode }) {
  const visibleChildren = node.children.slice(0, 8);
  const hiddenChildCount = node.children.length - visibleChildren.length;

  return (
    <article className="pixel-panel grid gap-4 p-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            {node.code ? <StatusChip>{node.code}</StatusChip> : null}
            <StatusChip>题量 {node.questionCount}</StatusChip>
            <StatusChip>子项 {node.directChildCount}</StatusChip>
            <StatusChip>新题 {node.newQuestionCount}</StatusChip>
            <StatusChip>已练 {node.practicedQuestionCount}</StatusChip>
            <StatusChip>正确率 {accuracyLabel(node)}</StatusChip>
            {node.pendingWrongNotes ? <StatusChip tone="danger">错题 {node.pendingWrongNotes}</StatusChip> : null}
          </div>
          <h2 className="break-words text-xl font-black leading-8">{node.title}</h2>
          {node.description ? <p className="mt-2 max-h-[5.25rem] overflow-hidden leading-7 text-[var(--muted)]">{node.description}</p> : null}
        </div>
        <PracticeActions node={node} />
      </div>

      {visibleChildren.length > 0 ? (
        <div className="grid gap-2">
          {visibleChildren.map((child) => (
            <KnowledgeChildRow key={child.id} node={child} />
          ))}
          {hiddenChildCount > 0 ? (
            <Link href={`/knowledge/${encodeURIComponent(node.id)}` as Route} className="border-2 border-black bg-white p-3 text-sm font-black hover:bg-[var(--surface-subtle)]">
              还有 {hiddenChildCount} 个小项，查看详情
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function KnowledgeChildRow({ node }: { node: KnowledgeTreeNode }) {
  return (
    <div className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-2">
          {node.code ? <StatusChip className="text-xs">{node.code}</StatusChip> : null}
          <StatusChip className="text-xs">题量 {node.questionCount}</StatusChip>
          {node.descendantCount > 0 ? <StatusChip className="text-xs">子项 {node.descendantCount}</StatusChip> : null}
          <StatusChip className="text-xs">新题 {node.newQuestionCount}</StatusChip>
          <StatusChip className="text-xs">已练 {node.practicedQuestionCount}</StatusChip>
          <StatusChip className="text-xs">正确率 {accuracyLabel(node)}</StatusChip>
          {node.pendingWrongNotes ? (
            <StatusChip className="text-xs" tone="danger">
              错题 {node.pendingWrongNotes}
            </StatusChip>
          ) : null}
        </div>
        <h3 className="break-words font-black">{node.title}</h3>
      </div>
      <PracticeActions compact node={node} />
    </div>
  );
}

function PracticeActions({ compact = false, node }: { compact?: boolean; node: KnowledgeTreeNode }) {
  return (
    <div className="flex flex-wrap gap-2 self-start">
      {node.questionCount > 0 ? (
        <Link href={`/practice?mode=new&knowledgeNodeId=${encodeURIComponent(node.id)}` as Route} className={`pixel-button h-fit whitespace-nowrap ${compact ? "px-3 py-2 text-sm" : "px-4 py-2"}`}>
          练新题
        </Link>
      ) : null}
      {node.pendingWrongNotes > 0 ? (
        <Link href={`/practice?mode=wrong&knowledgeNodeId=${encodeURIComponent(node.id)}` as Route} className={`pixel-button h-fit whitespace-nowrap bg-white ${compact ? "px-3 py-2 text-sm" : "px-4 py-2"}`}>
          练错题
        </Link>
      ) : null}
      <Link href={`/knowledge/${encodeURIComponent(node.id)}` as Route} className={`pixel-button h-fit whitespace-nowrap bg-white ${compact ? "px-3 py-2 text-sm" : "px-4 py-2"}`}>
        详情
      </Link>
    </div>
  );
}

function groupKnowledgeTree(roots: ReadyKnowledgeDashboard["tree"]) {
  const groups = new Map<string, typeof roots>();

  for (const node of roots) {
    const group = groups.get(node.subjectPath) ?? [];
    group.push(node);
    groups.set(node.subjectPath, group);
  }

  return [...groups.entries()].map(([subjectPath, groupedRoots]) => ({ subjectPath, roots: groupedRoots }));
}

function sumRootMetric(tree: ReadyKnowledgeDashboard["tree"], key: "newQuestionCount" | "pendingWrongNotes" | "practicedQuestionCount") {
  return tree.reduce((sum, node) => sum + node[key], 0);
}

function accuracyLabel(node: Pick<KnowledgeTreeNode, "accuracy" | "practicedQuestionCount">) {
  return node.practicedQuestionCount > 0 ? `${node.accuracy}%` : "未练";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[var(--surface-subtle)] p-3">
      <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </article>
  );
}
