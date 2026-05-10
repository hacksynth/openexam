import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getUserAiSettings } from "@openexam/core/ai";
import { FeedbackMessage, SelectField, SubmitButton, TextField } from "@openexam/core/pixel-ui";
import { deleteProviderKeyAction, listProviderModelsAction, saveProviderKeyAction } from "./actions";

type ProfilePageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const session = await requireWebSession();
  const [params, settings] = await Promise.all([searchParams, getUserAiSettings(session.user.id)]);

  return (
    <AppShell section="learner" eyebrow="个人设置" title="个人设置">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        {settings.providers.map((provider) => (
          <section key={provider.provider} className="pixel-panel grid gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">BYOK</p>
              <h2 className="mt-1 text-xl font-black">{provider.label} API Key</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={`status-chip px-2 py-1 ${provider.configured ? "bg-[var(--teal)]" : ""}`}>
                {provider.configured ? `已配置 ${provider.keyHint}` : "未配置"}
              </span>
              {provider.baseUrl ? <span className="status-chip px-2 py-1">{provider.baseUrl}</span> : null}
              {provider.provider === "openai" ? <span className="status-chip px-2 py-1">{provider.apiMode === "responses" ? "Responses" : "Chat Completions"}</span> : null}
              {provider.needsBaseUrl ? <span className="status-chip bg-[var(--danger)] px-2 py-1 text-white">需补全 Base URL</span> : null}
              {provider.platformAvailable ? <span className="status-chip px-2 py-1">平台 Key 可用</span> : null}
              {provider.updatedAt ? <span className="status-chip px-2 py-1">更新 {formatDate(provider.updatedAt)}</span> : null}
            </div>

            <form action={saveProviderKeyAction} className="grid gap-3">
              <input name="provider" type="hidden" value={provider.provider} />
              <div className="grid gap-3 lg:grid-cols-2">
                <TextField label={provider.provider === "openai" ? "API Key" : `${provider.label} Key`} name="apiKey" placeholder={provider.provider === "openai" ? "sk-..." : "输入 provider key"} required type="password" />
                <TextField label="Base URL" name="baseUrl" defaultValue={provider.baseUrl ?? defaultBaseUrl(provider.provider)} placeholder={defaultBaseUrl(provider.provider)} required />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {provider.provider === "openai" ? (
                  <SelectField label="OpenAI API 模式" name="apiMode" defaultValue={provider.apiMode ?? "chat"}>
                    <option value="chat">Chat Completions</option>
                    <option value="responses">Responses</option>
                  </SelectField>
                ) : (
                  <input name="apiMode" type="hidden" value="" />
                )}
                <TextField label="测试模型" name="testModel" placeholder={provider.provider === "openai" ? "gpt-5.5" : "输入模型名"} required />
              </div>
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="bg-white px-4 py-2" formAction={listProviderModelsAction} label="获取模型" />
                <SubmitButton className="px-4 py-2" label={provider.provider === "openai" ? "测试并保存 Key" : `测试并保存 ${provider.label} Key`} />
              </div>
            </form>

            {provider.configured ? (
              <form action={deleteProviderKeyAction}>
                <input name="provider" type="hidden" value={provider.provider} />
                <SubmitButton className="bg-white px-4 py-2" label="删除 Key" />
              </form>
            ) : null}
          </section>
        ))}
      </section>
    </AppShell>
  );
}

function defaultBaseUrl(provider: string) {
  if (provider === "openai") {
    return "https://api.openai.com/v1";
  }

  if (provider === "anthropic") {
    return "https://api.anthropic.com";
  }

  return "https://generativelanguage.googleapis.com/v1beta";
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
