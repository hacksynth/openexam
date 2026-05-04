import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { adminRoutes } from "@openexam/core/routes";

export default function AdminPage() {
  return (
    <AppShell section="admin" eyebrow="管理端基础版" title="管理台">
      <section className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-4">
          {["公开审核", "队列任务", "AI 调用", "审计事件"].map((label, index) => (
            <article key={label} className="pixel-panel p-4">
              <p className="text-xs font-bold uppercase text-[var(--muted)]">{label}</p>
              <p className="mt-2 text-4xl font-black">{[0, 2, 0, 0][index]}</p>
            </article>
          ))}
        </div>

        <section className="pixel-panel p-5">
          <h2 className="mb-4 text-xl font-black">治理模块</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {adminRoutes
              .filter((route) => route.href !== "/")
              .map((route) => (
                <Link key={route.id} href={route.href as Route} className="border-3 border-black bg-white p-4 hover:bg-[var(--primary)]">
                  <span className="block text-lg font-black">{route.label}</span>
                  <span className="mt-2 block text-sm leading-6 text-[var(--muted)]">{route.description}</span>
                </Link>
              ))}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
