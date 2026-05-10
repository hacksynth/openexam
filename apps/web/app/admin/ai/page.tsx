import { AiProvider, AiTaskType } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { AiCredentialForm } from "@/components/ai-credential-form";
import { requireAdminSession } from "@/lib/auth";
import { getAdminAiCredentialSettings, getAiUsageOverview, listAdminAiProviderPresets } from "@openexam/core/ai";
import { FeedbackMessage, PixelChoice, SelectField, SubmitButton, TextField } from "@openexam/core/pixel-ui";
import { disableAiProviderPresetAction, enableAiProviderPresetAction, listAdminAiCredentialModelsAction, saveAdminAiCredentialAction, testAdminAiCredentialAction, upsertAiProviderPresetAction } from "./actions";

type AdminAiPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
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

export default async function AdminAiPage({ searchParams }: AdminAiPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const [presets, usage, credentials] = await Promise.all([listAdminAiProviderPresets(), getAiUsageOverview(), getAdminAiCredentialSettings()]);

  return (
    <AppShell section="admin" eyebrow="AI 配置" title="AI">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

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
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Platform Credentials</p>
            <h2 className="mt-1 text-xl font-black">平台凭据</h2>
          </div>
          <div className="grid gap-4">
            {credentials.providers.map((credential) => (
              <section key={credential.provider} className="grid gap-3 border-2 border-black bg-white p-3">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{credential.label}</span>
                  <span className={`status-chip px-2 py-1 ${credential.configured ? "bg-[var(--teal)]" : ""}`}>{credential.configured ? `已配置 ${credential.keyHint ?? ""}` : "未配置"}</span>
                  {credential.source ? <span className="status-chip px-2 py-1">{credential.source === "admin" ? "管理员配置" : "环境变量"}</span> : null}
                  {credential.baseUrl ? <span className="status-chip px-2 py-1">{credential.baseUrl}</span> : null}
                  {credential.defaultModel ? <span className="status-chip px-2 py-1">{credential.defaultModel}</span> : null}
                  {credential.provider === AiProvider.openai ? <span className="status-chip px-2 py-1">{credential.apiMode === "responses" ? "Responses" : "Chat Completions"}</span> : null}
                  {credential.lastTestedModel ? <span className="status-chip px-2 py-1">测试 {credential.lastTestedModel}</span> : null}
                </div>
                <AiCredentialForm
                  provider={credential}
                  listModelsAction={listAdminAiCredentialModelsAction}
                  saveAction={saveAdminAiCredentialAction}
                  saveLabel="保存凭据"
                  testAction={testAdminAiCredentialAction}
                />
              </section>
            ))}
          </div>
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
                    {preset.tasks.length > 0 ? (
                      preset.tasks.map((task) => (
                        <span key={task.taskType} className="status-chip px-2 py-1">
                          {taskLabels[task.taskType] ?? task.taskType}
                        </span>
                      ))
                    ) : (
                      <span className="status-chip px-2 py-1">非默认</span>
                    )}
                    {preset.maxTokens ? <span className="status-chip px-2 py-1">Max {preset.maxTokens}</span> : null}
                    {preset.temperature !== null ? <span className="status-chip px-2 py-1">Temp {preset.temperature}</span> : null}
                  </div>
                  <h2 className="break-words text-xl font-black leading-8">{preset.label}</h2>
                  <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{preset.model}</p>
                </div>
                <PresetActions presetId={preset.id} enabled={preset.enabled} />
                <PresetForm
                  id={preset.id}
                  provider={preset.provider}
                  label={preset.label}
                  model={preset.model}
                  capabilities={preset.capabilities}
                  defaultForTasks={preset.tasks.map((task) => task.taskType)}
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
  provider = AiProvider.openai,
  model = "",
  label = "",
  capabilities = ["text", "json"],
  defaultForTasks = [],
  temperature = null,
  maxTokens = 700,
  enabled = true,
  submitLabel
}: {
  id?: string;
  provider?: AiProvider;
  model?: string;
  label?: string;
  capabilities?: string[];
  defaultForTasks?: string[];
  temperature?: number | null;
  maxTokens?: number | null;
  enabled?: boolean;
  submitLabel: string;
}) {
  return (
    <form action={upsertAiProviderPresetAction} className="grid gap-4">
      {id ? <input name="id" type="hidden" value={id} /> : null}
      <div className="grid gap-3 lg:grid-cols-[0.8fr_1fr_1fr_0.8fr_0.8fr]">
        <SelectField label="Provider" name="provider" defaultValue={provider}>
          {Object.values(AiProvider).map((item) => (
            <option key={item} value={item}>
              {item === AiProvider.anthropic ? "Claude" : item === AiProvider.gemini ? "Gemini" : "OpenAI"}
            </option>
          ))}
        </SelectField>
        <TextField label="模型" name="model" defaultValue={model} placeholder="gpt-5.5" required />
        <TextField label="名称" name="label" defaultValue={label} placeholder="OpenAI GPT-5.5" />
        <TextField label="Temperature" name="temperature" defaultValue={temperature === null ? "" : String(temperature)} placeholder="0.2" />
        <TextField label="Max Tokens" name="maxTokens" defaultValue={maxTokens === null ? "" : String(maxTokens)} placeholder="700" />
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-bold">默认任务</legend>
        <div className="flex flex-wrap gap-3">
          {Object.values(AiTaskType).map((taskType) => (
            <PixelChoice key={taskType} className="items-center bg-white px-3 py-2 text-sm" defaultChecked={defaultForTasks.includes(taskType)} inputClassName="mt-0 h-4 w-4" name="defaultForTasks" type="checkbox" value={taskType}>
              {taskLabels[taskType] ?? taskType}
            </PixelChoice>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-bold">Capabilities</legend>
        <div className="flex flex-wrap gap-3">
          {["text", "json", "vision", "document", "image"].map((capability) => (
            <PixelChoice key={capability} className="items-center bg-white px-3 py-2 text-sm" defaultChecked={capabilities.includes(capability)} inputClassName="mt-0 h-4 w-4" name="capabilities" type="checkbox" value={capability}>
              {capability}
            </PixelChoice>
          ))}
        </div>
      </fieldset>
      <PixelChoice className="w-fit items-center border-0 bg-transparent p-0 text-sm" defaultChecked={enabled} inputClassName="mt-0" name="enabled" type="checkbox">
        启用
      </PixelChoice>
      <SubmitButton className="w-fit px-4 py-2" label={submitLabel} />
    </form>
  );
}

function PresetActions({ presetId, enabled }: { presetId: string; enabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 border-2 border-black bg-[var(--surface-subtle)] p-3">
      {enabled ? (
        <form action={disableAiProviderPresetAction}>
          <input name="id" type="hidden" value={presetId} />
          <SubmitButton className="bg-white px-3 py-2" label="停用预设" />
        </form>
      ) : (
        <form action={enableAiProviderPresetAction}>
          <input name="id" type="hidden" value={presetId} />
          <SubmitButton className="bg-white px-3 py-2" label="启用预设" />
        </form>
      )}
    </div>
  );
}
