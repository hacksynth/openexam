import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { PaginationHeader, PaginationNav } from "@/components/pagination";
import { requireWebSession } from "@/lib/auth";
import { getContextChatThread, listContextChatThreads } from "@openexam/core/context-chat";
import { FeedbackMessage, SubmitButton, TextareaField } from "@openexam/core/pixel-ui";
import { sendContextChatMessageAction } from "./actions";

type ChatPageProps = {
  searchParams: Promise<{ thread?: string; contextType?: string; contextId?: string; error?: string; notice?: string; page?: string; pageSize?: string }>;
};

export default async function ContextChatPage({ searchParams }: ChatPageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const [threads, activeThread] = await Promise.all([
    listContextChatThreads(session.user.id, params),
    params.thread ? getContextChatThread(session.user.id, params.thread) : Promise.resolve(null)
  ]);
  const contextReady = Boolean(activeThread || (params.contextType && params.contextId));

  return (
    <AppShell section="learner" eyebrow="上下文 AI 对话" title="AI 对话">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">Context Chat</p>
              <h2 className="mt-1 text-xl font-black">{activeThread?.title ?? "选择资料、题目、错题或计划后开始提问"}</h2>
              <p className="mt-1 text-sm font-bold text-[var(--muted)]">{activeThread?.inputContextSource ?? "上下文入口会从资料页、错题本、学习计划等页面带入。"}</p>
            </div>
            <Link href={"/materials" as Route} className="pixel-button bg-white px-4 py-2">
              去资料页
            </Link>
          </div>

          {activeThread ? (
            <div className="grid gap-3">
              {activeThread.messages.map((message) => (
                <article key={message.id} className={`border-2 border-black p-3 ${message.role === "assistant" ? "bg-[var(--ai-soft)]" : "bg-white"}`}>
                  <p className="text-xs font-black uppercase text-[var(--muted)]">{message.role === "assistant" ? "AI" : "User"}</p>
                  <p className="mt-1 whitespace-pre-line leading-7">{message.content}</p>
                </article>
              ))}
            </div>
          ) : contextReady ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">输入第一个问题后会创建新的上下文对话。</p>
          ) : (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">当前没有选定上下文。可从资料页点击“用资料提问”。</p>
          )}

          {contextReady ? (
            <form action={sendContextChatMessageAction} className="grid gap-3">
              <input name="threadId" type="hidden" value={activeThread?.id ?? ""} />
              <input name="contextType" type="hidden" value={activeThread?.contextType ?? params.contextType ?? ""} />
              <input name="contextId" type="hidden" value={activeThread?.contextId ?? params.contextId ?? ""} />
              <TextareaField label="问题" name="message" placeholder="围绕当前上下文提问" required textareaClassName="min-h-28 text-base" />
              <SubmitButton className="w-fit px-4 py-2" label="发送" />
            </form>
          ) : null}
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Threads</p>
            <h2 className="mt-1 text-xl font-black">最近对话</h2>
          </div>
          <PaginationHeader basePath="/ai/chat" itemLabel="个" pagination={threads.pagination} params={params} />
          {threads.items.length === 0 ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">暂无上下文对话。</p>
          ) : (
            <div className="grid gap-3">
              {threads.items.map((thread) => (
                <Link key={thread.id} href={`/ai/chat?thread=${encodeURIComponent(thread.id)}` as Route} className="border-2 border-black bg-white p-3 hover:bg-[var(--primary)]">
                  <span className="block font-black">{thread.title}</span>
                  <span className="mt-1 block text-xs font-bold text-[var(--muted)]">{thread.inputContextSource}</span>
                  {thread.lastMessage ? <span className="mt-2 line-clamp-2 block text-sm text-[var(--muted)]">{thread.lastMessage}</span> : null}
                </Link>
              ))}
            </div>
          )}
          <PaginationNav basePath="/ai/chat" pagination={threads.pagination} params={params} />
        </section>
      </section>
    </AppShell>
  );
}
