import { AiProvider, AiTaskType } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { getAiUsageOverview, listAdminAiProviderPresets } from "@openexam/core/ai";
import { disableAiProviderPresetAction, enableAiProviderPresetAction, upsertAiProviderPresetAction } from "./actions";

type AdminAiPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const inputClass = "min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold";
const labelClass = "grid gap-2 text-sm font-bold";

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

export default async function AdminAiPage({ searchParams }: AdminAiPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const [presets, usage] = await Promise.all([listAdminAiProviderPresets(), getAiUsageOverview()]);

  return (
    <AppShell section="admin" eyebrow="AI 配置" title="AI">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        <section className="grid gap-4 md:grid-cols-4">
          <article className="pixel-panel p-4">
            <p className="text-xs font-bold uppercase text-[var(--muted)]">今日调用</p>
            <p className="mt-2 text-4xl font-black">{usage.todayCalls}</p>
          </article>
          <article className="pixel-panel p-4">
            <p className="text-xs font-bold uppercase text-[var(--muted)]">失败</p>
            <p className="mt-2 text-4xl font-black">{usage.todayFailures}</p>
          </article>
          <article className="pixel-panel p-4">
            <p className="text-xs font-bold uppercase text-[var(--muted)]">平台调用</p>
            <p className="mt-2 text-4xl font-black">{usage.platformCalls}</p>
          </article>
          <article className="pixel-panel p-4">
            <p className="text-xs font-bold uppercase text-[var(--muted)]">平台 Token</p>
            <p className="mt-2 text-4xl font-black">{usage.platformTokens}</p>
          </article>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Provider Preset</p>
            <h2 className="mt-1 text-xl font-black">新增模型预设</h2>
          </div>
          <PresetForm submitLabel="新增预设" />
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">模型预设</h2>
            <span className="status-chip px-2 py-1">当前 {presets.length} 个</span>
          </div>
          {presets.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无模型预设</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">新增 OpenAI 模型预设后，学习端错题解析会使用启用状态下的默认题目解析模型。</p>
            </section>
          ) : (
            presets.map((preset) => (
              <section key={preset.id} className="pixel-panel grid gap-4 p-5">
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="status-chip px-2 py-1">{preset.provider.toUpperCase()}</span>
                    <span className="status-chip px-2 py-1">{preset.enabled ? "启用" : "停用"}</span>
                    <span className="status-chip px-2 py-1">{preset.defaultForTask ? taskLabels[preset.defaultForTask] ?? preset.defaultForTask : "非默认"}</span>
                    {preset.maxTokens ? <span className="status-chip px-2 py-1">Max {preset.maxTokens}</span> : null}
                    {preset.temperature !== null ? <span className="status-chip px-2 py-1">Temp {preset.temperature}</span> : null}
                  </div>
                  <h2 className="break-words text-xl font-black leading-8">{preset.label}</h2>
                  <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{preset.model}</p>
                </div>
                <PresetActions presetId={preset.id} enabled={preset.enabled} />
                <PresetForm
                  id={preset.id}
                  label={preset.label}
                  model={preset.model}
                  defaultForTask={preset.defaultForTask}
                  temperature={preset.temperature}
                  maxTokens={preset.maxTokens}
                  enabled={preset.enabled}
                  submitLabel="保存预设"
                />
              </section>
            ))
          )}
        </section>
      </section>
    </AppShell>
  );
}

function PresetForm({
  id,
  model = "",
  label = "",
  defaultForTask = AiTaskType.explain_question,
  temperature = null,
  maxTokens = 700,
  enabled = true,
  submitLabel
}: {
  id?: string;
  model?: string;
  label?: string;
  defaultForTask?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  enabled?: boolean;
  submitLabel: string;
}) {
  return (
    <form action={upsertAiProviderPresetAction} className="grid gap-4">
      {id ? <input name="id" type="hidden" value={id} /> : null}
      <input name="provider" type="hidden" value={AiProvider.openai} />
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_0.8fr_0.8fr]">
        <TextField label="模型" name="model" defaultValue={model} placeholder="gpt-5.5" required />
        <TextField label="名称" name="label" defaultValue={label} placeholder="OpenAI GPT-5.5" />
        <SelectField label="默认任务" name="defaultForTask" defaultValue={defaultForTask ?? ""}>
          <option value="">非默认</option>
          {Object.values(AiTaskType).map((taskType) => (
            <option key={taskType} value={taskType}>
              {taskLabels[taskType] ?? taskType}
            </option>
          ))}
        </SelectField>
        <TextField label="Temperature" name="temperature" defaultValue={temperature === null ? "" : String(temperature)} placeholder="0.2" />
        <TextField label="Max Tokens" name="maxTokens" defaultValue={maxTokens === null ? "" : String(maxTokens)} placeholder="700" />
      </div>
      <label className="flex w-fit items-center gap-2 text-sm font-bold">
        <input className="h-5 w-5 accent-black" defaultChecked={enabled} name="enabled" type="checkbox" />
        启用
      </label>
      <button className="pixel-button w-fit px-4 py-2" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}

function PresetActions({ presetId, enabled }: { presetId: string; enabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 border-2 border-black bg-[var(--surface-subtle)] p-3">
      {enabled ? (
        <form action={disableAiProviderPresetAction}>
          <input name="id" type="hidden" value={presetId} />
          <button className="pixel-button bg-white px-3 py-2 text-sm" type="submit">
            停用预设
          </button>
        </form>
      ) : (
        <form action={enableAiProviderPresetAction}>
          <input name="id" type="hidden" value={presetId} />
          <button className="pixel-button bg-white px-3 py-2 text-sm" type="submit">
            启用预设
          </button>
        </form>
      )}
    </div>
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

function TextField({
  label,
  name,
  defaultValue = "",
  placeholder,
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} defaultValue={defaultValue} name={name} placeholder={placeholder} required={required} />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  children
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={labelClass}>
      {label}
      <select className={inputClass} defaultValue={defaultValue} name={name}>
        {children}
      </select>
    </label>
  );
}
