import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { listJobs } from "@openexam/core/jobs";
import { processJobAction, processNextJobAction, recoverStaleJobsAction, retryJobAction } from "./actions";

type AdminJobsPageProps = {
  searchParams: Promise<{ error?: string; notice?: string; status?: string }>;
};

const statusOptions = [
  { value: "", label: "全部" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "运行中" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" }
];

export default async function AdminJobsPage({ searchParams }: AdminJobsPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const jobs = await listJobs({ status: params.status });

  return (
    <AppShell section="admin" eyebrow="任务队列" title="任务">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">Queue</p>
              <h2 className="mt-1 text-xl font-black">任务处理</h2>
            </div>
            <form action={processNextJobAction}>
              <button className="pixel-button px-4 py-2" type="submit">
                处理下一条
              </button>
            </form>
            <form action={recoverStaleJobsAction}>
              <button className="pixel-button bg-white px-4 py-2" type="submit">
                恢复超时任务
              </button>
            </form>
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <Link key={option.value || "all"} href={(option.value ? `/jobs?status=${option.value}` : "/jobs") as Route} className={`status-chip px-3 py-2 ${params.status === option.value || (!params.status && !option.value) ? "bg-[var(--primary)]" : ""}`}>
                {option.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">任务列表</h2>
            <span className="status-chip px-2 py-1">当前 {jobs.length} 条</span>
          </div>
          {jobs.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无任务</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">上传资料或生成错题复习卡后会创建任务。</p>
            </section>
          ) : (
            jobs.map((job) => (
              <article key={job.id} className="pixel-panel grid gap-3 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className={`status-chip px-2 py-1 ${job.status === "failed" ? "bg-[var(--danger)] text-white" : job.status === "succeeded" ? "bg-[var(--teal)]" : ""}`}>
                    {statusLabel(job.status)}
                  </span>
                  <span className="status-chip px-2 py-1">{job.type}</span>
                  <span className="status-chip px-2 py-1">进度 {job.progress}%</span>
                  {job.userEmail ? <span className="status-chip px-2 py-1">{job.userEmail}</span> : null}
                </div>
                <h2 className="break-words text-xl font-black">{job.materialTitle ?? job.wrongNoteTitle ?? job.id}</h2>
                <p className="text-sm font-bold text-[var(--muted)]">创建 {formatDate(job.createdAt)} / 更新 {formatDate(job.updatedAt)}</p>
                {job.error ? <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{job.error}</p> : null}
                <div className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold md:grid-cols-2">
                  <p className="break-all">ID：{job.id}</p>
                  <p>Run At：{formatDate(job.runAt)}</p>
                  <p>Started：{job.startedAt ? formatDate(job.startedAt) : "未开始"}</p>
                  <p>Finished：{job.finishedAt ? formatDate(job.finishedAt) : "未完成"}</p>
                  {job.materialId ? <p className="break-all">Material：{job.materialId}</p> : null}
                  {job.wrongNoteId ? <p className="break-all">Wrong Note：{job.wrongNoteId}</p> : null}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <JsonBlock label="Payload" value={job.payload} />
                  <JsonBlock label="Result" value={job.result} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.status === "queued" || job.status === "failed" ? (
                    <form action={processJobAction}>
                      <input name="jobId" type="hidden" value={job.id} />
                      <button className="pixel-button bg-white px-3 py-2 text-sm" type="submit">
                        立即处理
                      </button>
                    </form>
                  ) : null}
                  {job.status === "failed" ? (
                    <form action={retryJobAction}>
                      <input name="jobId" type="hidden" value={job.id} />
                      <button className="pixel-button bg-white px-3 py-2 text-sm" type="submit">
                        重试
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </AppShell>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid gap-2 border-2 border-black bg-white p-3">
      <p className="text-sm font-bold text-[var(--muted)]">{label}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs font-bold leading-5">{formatJson(value)}</pre>
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

function statusLabel(value: string) {
  return { queued: "排队中", running: "运行中", succeeded: "成功", failed: "失败", canceled: "已取消" }[value] ?? value;
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

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  return JSON.stringify(value, null, 2);
}
