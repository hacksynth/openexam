import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { PaginationHeader, PaginationNav } from "@/components/pagination";
import { requireWebSession } from "@/lib/auth";
import { FeedbackMessage, SubmitButton } from "@openexam/core/pixel-ui";
import { listConsolidationNotes } from "@openexam/core/practice";
import { setConsolidationNoteMasteredAction } from "./actions";

type ConsolidationPageProps = {
  searchParams: Promise<{ error?: string; notice?: string; filter?: string; knowledgeNodeId?: string; page?: string; pageSize?: string }>;
};

type ConsolidationNoteListItem = Awaited<ReturnType<typeof listConsolidationNotes>>["items"][number];

const filterOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待巩固" },
  { value: "mastered", label: "已掌握" }
] as const;

export default async function ConsolidationPage({ searchParams }: ConsolidationPageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const filter = normalizeFilter(params.filter);
  const knowledgeNodeId = params.knowledgeNodeId?.trim() || "";
  const state = await listConsolidationNotes(session.user.id, {
    mastered: filter === "pending" ? false : filter === "mastered" ? true : undefined,
    knowledgeNodeId,
    page: params.page,
    pageSize: params.pageSize
  });
  const currentHref = consolidationHref(filter, knowledgeNodeId, params.page, params.pageSize);

  return (
    <AppShell section="learner" eyebrow="掌握闭环" title="待巩固">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Consolidation</p>
            <h2 className="mt-2 text-2xl font-black">待巩固 {state.pendingCount} 题</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">答对但标记未掌握的题会进入这里，不计入错题本和正确率。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={"/practice" as Route} className="pixel-button px-4 py-2">
              开始练习
            </Link>
            <Link href={"/practice?mode=consolidation" as Route} className="pixel-button bg-white px-4 py-2">
              巩固正确题
            </Link>
            <Link href={"/wrong-notes" as Route} className="pixel-button bg-white px-4 py-2">
              错题本
            </Link>
            <Link href={"/dashboard" as Route} className="pixel-button bg-white px-4 py-2">
              返回仪表盘
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <Link
                key={option.value}
                href={consolidationHref(option.value, knowledgeNodeId, 1, params.pageSize) as Route}
                className={`status-chip px-3 py-2 ${filter === option.value ? "bg-[var(--primary)]" : ""}`}
              >
                {option.label}
              </Link>
            ))}
          </div>
          {state.summary.weakKnowledgeNodes.length > 0 ? (
            <div className="grid gap-3 border-2 border-black bg-white p-3">
              <p className="text-sm font-bold text-[var(--muted)]">待巩固知识点</p>
              <div className="flex flex-wrap gap-2">
                {state.summary.weakKnowledgeNodes.map((node) => (
                  <span key={node.title} className="status-chip px-2 py-1">
                    {node.title} · {node.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {state.knowledgeOptions.length > 0 ? (
            <div className="grid gap-3">
              <p className="text-sm font-bold text-[var(--muted)]">按知识点筛选</p>
              <div className="flex flex-wrap gap-2">
                <Link href={consolidationHref(filter, "", 1, params.pageSize) as Route} className={`status-chip px-3 py-2 ${knowledgeNodeId ? "" : "bg-[var(--primary)]"}`}>
                  全部知识点
                </Link>
                {state.knowledgeOptions.map((node) => (
                  <Link
                    key={node.id}
                    href={consolidationHref(filter, node.id, 1, params.pageSize) as Route}
                    className={`status-chip px-3 py-2 ${knowledgeNodeId === node.id ? "bg-[var(--primary)]" : ""}`}
                  >
                    {node.title} · {node.count}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <PaginationHeader basePath="/consolidation" itemLabel="题" pagination={state.pagination} params={params} />

        {state.items.length === 0 ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <h2 className="text-2xl font-black">暂无待巩固题</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">{filter === "all" ? "答对后点击标记未掌握，这里会显示题目、正确答案、解析和关联知识点。" : "当前筛选条件下暂无待巩固题。"}</p>
            </div>
            <Link href={"/practice" as Route} className="pixel-button w-fit px-4 py-2">
              去练习
            </Link>
          </section>
        ) : (
          <section className="grid gap-4">
            {state.items.map((note) => (
              <ConsolidationNoteCard key={note.id} currentHref={currentHref} note={note} />
            ))}
          </section>
        )}
        <PaginationNav basePath="/consolidation" pagination={state.pagination} params={params} />
      </section>
    </AppShell>
  );
}

function ConsolidationNoteCard({ note, currentHref }: { note: ConsolidationNoteListItem; currentHref: string }) {
  return (
    <article className="pixel-panel grid gap-4 p-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className={`status-chip px-2 py-1 ${note.mastered ? "bg-[var(--teal)]" : "bg-[var(--primary)]"}`}>
              {note.mastered ? "已掌握" : "待巩固"}
            </span>
            <span className="status-chip px-2 py-1">更新 {formatDate(note.updatedAt)}</span>
          </div>
          <h2 className="break-words text-xl font-black leading-8">{note.stem}</h2>
        </div>
        <form action={setConsolidationNoteMasteredAction} className="self-start">
          <input name="consolidationNoteId" type="hidden" value={note.id} />
          <input name="mastered" type="hidden" value={note.mastered ? "false" : "true"} />
          <input name="returnTo" type="hidden" value={currentHref} />
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <Link href={`/practice?mode=consolidation&question=${note.questionId}` as Route} className="pixel-button whitespace-nowrap bg-white px-4 py-2">
              重练此题
            </Link>
            <SubmitButton className="whitespace-nowrap px-4 py-2" label={note.mastered ? "标记待巩固" : "标记已掌握"} />
          </div>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {note.knowledgeNodes.map((node) => (
          <span key={node.id} className="status-chip px-2 py-1">
            {node.title}
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
  );
}

function normalizeFilter(value: string | undefined): (typeof filterOptions)[number]["value"] {
  return filterOptions.some((option) => option.value === value) ? (value as (typeof filterOptions)[number]["value"]) : "all";
}

function consolidationHref(filter: string, knowledgeNodeId: string, page?: string | number, pageSize?: string | number) {
  const params = new URLSearchParams();

  params.set("filter", filter);

  if (knowledgeNodeId) {
    params.set("knowledgeNodeId", knowledgeNodeId);
  }

  if (page) {
    params.set("page", String(page));
  }

  if (pageSize) {
    params.set("pageSize", String(pageSize));
  }

  return `/consolidation?${params.toString()}`;
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
