import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { listUserAiCalls } from "@openexam/core/ai";

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
  diagnose_learning: "学习诊断",
  generate_wrong_note_image_prompt: "错题卡提示词",
  generate_image: "图片生成",
  chat_with_context: "上下文对话"
};

export default async function AiTasksPage() {
  const session = await requireWebSession();
  const calls = await listUserAiCalls(session.user.id);

  return (
    <AppShell section="learner" eyebrow="AI 任务" title="AI 任务">
      <section className="grid gap-5">
        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Calls</p>
            <h2 className="mt-1 text-xl font-black">最近调用</h2>
          </div>

          {calls.length === 0 ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">暂无 AI 调用记录。</p>
          ) : (
            <div className="grid gap-3">
              {calls.map((call) => (
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
                  <p className="mt-3 break-words text-sm font-bold text-[var(--muted)]">Prompt {call.promptVersion}</p>
                  {call.errorSummary ? <p className="mt-2 border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{call.errorSummary}</p> : null}
                </article>
              ))}
            </div>
          )}
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
