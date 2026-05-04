import { AppShell } from "@/components/app-shell";
import { getRoute, routeStatusLabels } from "@openexam/core/routes";

export function RoutePage({ routeId }: { routeId: string }) {
  const route = getRoute(routeId);
  const statusLabel = routeStatusLabels[route.status];

  return (
    <AppShell section={route.section} eyebrow={statusLabel} title={route.label}>
      <section className="pixel-panel grid gap-4 p-5">
        <span className="status-chip w-fit px-2 py-1">{statusLabel}</span>
        <p className="max-w-3xl text-lg font-bold leading-8 text-[var(--muted)]">{route.description}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="border-3 border-black bg-[var(--surface-subtle)] p-4">
            <h2 className="mb-2 text-base font-black">数据边界</h2>
            <p className="text-sm leading-6">学习数据默认私有，只有经过审核和发布流程才会进入公共内容。</p>
          </div>
          <div className="border-3 border-black bg-[var(--surface-subtle)] p-4">
            <h2 className="mb-2 text-base font-black">AI 边界</h2>
            <p className="text-sm leading-6">AI 任务按场景发起、记录日志，并在影响数据前做结构校验。</p>
          </div>
          <div className="border-3 border-black bg-[var(--surface-subtle)] p-4">
            <h2 className="mb-2 text-base font-black">下一阶段</h2>
            <p className="text-sm leading-6">后续按路线图把占位页替换成真实业务流程。</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
