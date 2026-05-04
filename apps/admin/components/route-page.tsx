import { AppShell } from "@/components/app-shell";
import { getRoute } from "@openexam/core/routes";

export function RoutePage({ routeId }: { routeId: string }) {
  const route = getRoute(routeId);

  return (
    <AppShell section={route.section} eyebrow={route.status} title={route.label}>
      <section className="pixel-panel grid gap-4 p-5">
        <span className="status-chip w-fit px-2 py-1">{route.status}</span>
        <p className="max-w-3xl text-lg font-bold leading-8 text-[var(--muted)]">{route.description}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border-3 border-black bg-[var(--surface-subtle)] p-4">
            <h2 className="mb-2 text-base font-black">Data Boundary</h2>
            <p className="text-sm leading-6">Private learner data stays isolated unless explicitly reviewed and published.</p>
          </div>
          <div className="border-3 border-black bg-[var(--surface-subtle)] p-4">
            <h2 className="mb-2 text-base font-black">AI Boundary</h2>
            <p className="text-sm leading-6">AI work is task-scoped, logged, and validated before affecting records.</p>
          </div>
          <div className="border-3 border-black bg-[var(--surface-subtle)] p-4">
            <h2 className="mb-2 text-base font-black">Next Slice</h2>
            <p className="text-sm leading-6">Replace this foundation page with the workflow from the roadmap deliverables.</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
