import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { listAuditLogs } from "@openexam/core/audit";
import { SubmitButton, TextField } from "@openexam/core/pixel-ui";

type AdminAuditPageProps = {
  searchParams: Promise<{ action?: string; entityType?: string; entityId?: string; actorId?: string }>;
};

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const logs = await listAuditLogs(params);

  return (
    <AppShell section="admin" eyebrow="审计" title="审计">
      <section className="grid gap-5">
        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Audit</p>
            <h2 className="mt-1 text-xl font-black">事件筛选</h2>
          </div>
          <form className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <TextField defaultValue={params.action ?? ""} label="动作" name="action" placeholder="动作" />
            <TextField defaultValue={params.entityType ?? ""} label="实体类型" name="entityType" placeholder="实体类型" />
            <TextField defaultValue={params.entityId ?? ""} label="实体 ID" name="entityId" placeholder="实体 ID" />
            <SubmitButton className="px-4 py-2" label="查询" />
          </form>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">事件列表</h2>
            <span className="status-chip px-2 py-1">当前 {logs.length} 条</span>
          </div>
          {logs.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无审计事件</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">管理端写操作会记录在这里。</p>
            </section>
          ) : (
            logs.map((log) => (
              <article key={log.id} className="pixel-panel grid gap-3 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{log.action}</span>
                  <span className="status-chip px-2 py-1">{log.entityType}</span>
                  {log.entityId ? <span className="status-chip px-2 py-1">{log.entityId}</span> : null}
                  <span className="status-chip px-2 py-1">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="font-bold text-[var(--muted)]">{log.actorEmail ?? log.actorName ?? "系统"}</p>
                {log.metadata ? (
                  <pre className="overflow-auto border-2 border-black bg-white p-3 text-xs font-bold">{JSON.stringify(log.metadata, null, 2)}</pre>
                ) : null}
              </article>
            ))
          )}
        </section>
      </section>
    </AppShell>
  );
}

function formatDateTime(value: Date) {
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
