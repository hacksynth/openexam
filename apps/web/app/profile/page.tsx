import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { getUserAiSettings } from "@openexam/core/ai";
import { deleteProviderKeyAction, saveOpenAiKeyAction } from "./actions";

type ProfilePageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const session = await requireWebSession();
  const [params, settings] = await Promise.all([searchParams, getUserAiSettings(session.user.id)]);

  return (
    <AppShell section="learner" eyebrow="个人设置" title="个人设置">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

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
              {provider.platformAvailable ? <span className="status-chip px-2 py-1">平台 Key 可用</span> : null}
              {provider.updatedAt ? <span className="status-chip px-2 py-1">更新 {formatDate(provider.updatedAt)}</span> : null}
            </div>

            <form action={saveOpenAiKeyAction} className="grid gap-3">
              <input name="provider" type="hidden" value={provider.provider} />
              <label className="grid gap-2 text-sm font-bold">
                {provider.provider === "openai" ? "API Key" : `${provider.label} Key`}
                <input className="border-3 border-black bg-white px-3 py-2" name="apiKey" placeholder={provider.provider === "openai" ? "sk-..." : "输入 provider key"} required type="password" />
              </label>
              <button className="pixel-button w-fit px-4 py-2" type="submit">
                {provider.provider === "openai" ? "保存 Key" : `保存 ${provider.label} Key`}
              </button>
            </form>

            {provider.configured ? (
              <form action={deleteProviderKeyAction}>
                <input name="provider" type="hidden" value={provider.provider} />
                <button className="pixel-button bg-white px-4 py-2" type="submit">
                  删除 Key
                </button>
              </form>
            ) : null}
          </section>
        ))}
      </section>
    </AppShell>
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
