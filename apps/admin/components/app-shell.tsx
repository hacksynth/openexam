import Link from "next/link";
import type { Route } from "next";
import { adminRoutes, sectionLabels, type AppSection } from "@openexam/core/routes";
import { SubmitButton } from "@openexam/core/pixel-ui";
import { requireAdminSession } from "@/lib/auth";
import { adminLogoutAction } from "@/app/logout/actions";

type AppShellProps = {
  section: AppSection;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
};

export async function AppShell({ section, title, eyebrow, children }: AppShellProps) {
  const session = await requireAdminSession();
  const accountLabel = session.user.name?.trim() || session.user.email;
  const accountTitle = session.user.name ? `${session.user.name} <${session.user.email}>` : session.user.email;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-6 px-4 py-5 md:grid-cols-[240px_1fr] md:px-6">
      <aside className="pixel-panel h-fit p-4">
        <Link href="/" className="mb-5 block border-b-3 border-black pb-4">
          <span className="block text-xs font-bold uppercase text-[var(--muted)]">OpenExam</span>
          <span className="block text-xl font-black">管理端</span>
        </Link>
        <nav aria-label={`${sectionLabels[section]}导航`} className="grid gap-2">
          {adminRoutes.map((route) => (
            <Link
              key={route.id}
              href={route.href as Route}
              className="border-2 border-black bg-white px-3 py-2 text-sm font-bold hover:bg-[var(--primary)]"
            >
              {route.label}
            </Link>
          ))}
        </nav>
        <form action={adminLogoutAction} className="mt-5 grid min-w-0 gap-3 border-t-3 border-black pt-4">
          <p className="min-w-0 truncate text-xs font-bold text-[var(--muted)]" title={accountTitle}>
            {accountLabel}
          </p>
          <SubmitButton className="w-full px-3 py-2" label="退出登录" />
        </form>
      </aside>

      <section className="grid content-start gap-5">
        <header className="pixel-panel p-5">
          <p className="mb-2 text-sm font-bold uppercase text-[var(--muted)]">{eyebrow}</p>
          <h1 className="text-3xl font-black md:text-5xl">{title}</h1>
        </header>
        {children}
      </section>
    </main>
  );
}
