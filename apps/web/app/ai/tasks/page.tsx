import { AppShell } from "@/components/app-shell";
import { PaginationHeader, PaginationNav } from "@/components/pagination";
import { requireWebSession } from "@/lib/auth";
import { listUserAiCalls } from "@openexam/core/ai";
import { FeedbackMessage, SubmitButton } from "@openexam/core/pixel-ui";
import { retryAiCallAction } from "./actions";

type AiTasksPageProps = {
  searchParams: Promise<{ error?: string; notice?: string; page?: string; pageSize?: string }>;
};

const statusLabels: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  canceled: "已取消"
};

const taskLabels: Record<string, string> = {
  explain_question: "题目解析",
  grade_subjective: "主观题评分",
  generate_plan: "学习计划",
  extract_questions: "题目抽取",
  generate_practice_questions: "AI 练习题生成",
  diagnose_learning: "学习诊断",
  generate_wrong_note_image_prompt: "错题卡提示词",
  generate_image: "图片生成",
  chat_with_context: "上下文对话"
};

export default async function AiTasksPage({ searchParams }: AiTasksPageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const calls = await listUserAiCalls(session.user.id, params);

  return (
    <AppShell section="learner" eyebrow="AI 任务" title="AI 任务">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Calls</p>
            <h2 className="mt-1 text-xl font-black">最近调用</h2>
          </div>
          <PaginationHeader basePath="/ai/tasks" itemLabel="次" pagination={calls.pagination} params={params} />

          {calls.items.length === 0 ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">暂无 AI 调用记录。</p>
          ) : (
            <div className="grid gap-3">
              {calls.items.map((call) => (
                <article key={call.id} className="border-3 border-black bg-white p-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="status-chip px-2 py-1">{taskLabels[call.taskType] ?? call.taskType}</span>
                    <span className={`status-chip px-2 py-1 ${call.status === "failed" ? "bg-[var(--danger)] text-white" : call.status === "succeeded" ? "bg-[var(--teal)]" : ""}`}>
                      {statusLabels[call.status] ?? call.status}
                    </span>
                    <span className="status-chip px-2 py-1">{call.provider}</span>
                    <span className="status-chip px-2 py-1">{call.model}</span>
                    <span className="status-chip px-2 py-1">{formatDate(call.createdAt)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="status-chip px-2 py-1">Prompt {call.promptVersion}</span>
                    <span className="status-chip px-2 py-1">耗时 {formatDuration(call.durationMs)}</span>
                    {formatUsage(call.usage) ? <span className="status-chip px-2 py-1">{formatUsage(call.usage)}</span> : null}
                  </div>
                  {call.errorSummary ? <p className="mt-2 border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{call.errorSummary}</p> : null}
                  {call.status === "failed" && call.taskType === "explain_question" ? (
                    <form action={retryAiCallAction} className="mt-3">
                      <input name="aiCallId" type="hidden" value={call.id} />
                      <SubmitButton className="bg-white px-3 py-2" label="重试" />
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          )}
          <PaginationNav basePath="/ai/tasks" pagination={calls.pagination} params={params} />
        </section>
      </section>
    </AppShell>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
    .format(value)
    .replaceAll("/", "-");
}

function formatDuration(value: number) {
  const duration = Math.max(0, value);

  if (duration < 1000) {
    return `${duration}ms`;
  }

  return `${(duration / 1000).toFixed(1)}s`;
}

function formatUsage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const usage = value as Record<string, unknown>;
  const total = usage.total_tokens;

  return typeof total === "number" ? `Token ${total}` : "";
}
