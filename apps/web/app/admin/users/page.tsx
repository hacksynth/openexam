import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { listAdminUsersWithAiUsage } from "@openexam/core/users";

export default async function AdminUsersPage() {
  await requireAdminSession();
  const users = await listAdminUsersWithAiUsage();

  return (
    <AppShell section="admin" eyebrow="用户与用量" title="用户">
      <section className="grid gap-5">
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">用户列表</h2>
            <span className="status-chip px-2 py-1">当前 {users.length} 人</span>
          </div>
          {users.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无用户</h2>
            </section>
          ) : (
            users.map((user) => (
              <article key={user.id} className="pixel-panel grid gap-3 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{user.role === "admin" ? "管理员" : "学习者"}</span>
                  <span className="status-chip px-2 py-1">AI {user.usage.total}</span>
                  <span className="status-chip px-2 py-1">失败 {user.usage.failed}</span>
                  <span className="status-chip px-2 py-1">BYOK {user.usage.byok}</span>
                  <span className="status-chip px-2 py-1">平台 {user.usage.platform}</span>
                  <span className="status-chip px-2 py-1">Token {user.usage.tokens}</span>
                </div>
                <h2 className="break-words text-xl font-black">{user.name || user.email}</h2>
                <p className="break-words text-sm font-bold text-[var(--muted)]">{user.email}</p>
                <p className="text-sm font-bold text-[var(--muted)]">
                  注册 {formatDate(user.createdAt)} / 最近 AI {user.usage.lastCalledAt ? formatDate(user.usage.lastCalledAt) : "暂无"}
                </p>
              </article>
            ))
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
