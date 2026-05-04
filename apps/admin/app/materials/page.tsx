import { AppShell } from "@/components/app-shell";
import { PixelSelect } from "@openexam/core/pixel-select";
import { requireAdminSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import { listAdminMaterials, listMaterialQuestionCandidates } from "@openexam/core/materials";
import { confirmCandidateAction, uploadAdminMaterialAction } from "./actions";

type AdminMaterialsPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const inputClass = "min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold";
const labelClass = "grid gap-2 text-sm font-bold";

export default async function AdminMaterialsPage({ searchParams }: AdminMaterialsPageProps) {
  await requireAdminSession();
  const [params, materials, candidates, subjects] = await Promise.all([searchParams, listAdminMaterials(), listMaterialQuestionCandidates(undefined), listKnowledgeHierarchy()]);
  const subjectOptions = subjects.map((subject) => ({
    id: subject.id,
    label: `${subject.cycle.track.program.name} / ${subject.cycle.track.name} / ${subject.cycle.name} / ${subject.name}`
  }));

  return (
    <AppShell section="admin" eyebrow="资料治理" title="资料">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Upload</p>
            <h2 className="mt-1 text-xl font-black">上传资料</h2>
          </div>
          <form action={uploadAdminMaterialAction} className="grid gap-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <TextField label="标题" name="title" placeholder="软件设计师章节资料" />
              <TextField label="来源许可" name="sourceLicense" placeholder="原创 / 授权 / 自用资料" />
            </div>
            <SelectField label="绑定科目" name="subjectId">
              <option value="">不绑定</option>
              {subjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </SelectField>
            <label className={labelClass}>
              文件
              <input className={inputClass} name="file" required type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" />
            </label>
            <button className="pixel-button w-fit px-4 py-2" type="submit">
              上传并创建抽题任务
            </button>
          </form>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">资料列表</h2>
            <span className="status-chip px-2 py-1">当前 {materials.length} 份</span>
          </div>
          {materials.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无资料</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">上传资料后，可在任务页处理 AI 抽题。</p>
            </section>
          ) : (
            materials.map((material) => (
              <article key={material.id} className="pixel-panel grid gap-3 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{stateLabel(material.extractionState)}</span>
                  <span className="status-chip px-2 py-1">{formatBytes(material.sizeBytes)}</span>
                  <span className="status-chip px-2 py-1">候选 {material.candidateCount}</span>
                  <span className="status-chip px-2 py-1">{material.ownerEmail}</span>
                  {material.latestJob ? <span className="status-chip px-2 py-1">任务 {jobStatusLabel(material.latestJob.status)}</span> : null}
                </div>
                <h2 className="break-words text-xl font-black">{material.title}</h2>
                <p className="text-sm font-bold text-[var(--muted)]">{material.mimeType}</p>
                {material.latestJob?.error ? <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{material.latestJob.error}</p> : null}
              </article>
            ))
          )}
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">候选题</h2>
            <span className="status-chip px-2 py-1">当前 {candidates.length} 道</span>
          </div>
          {candidates.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无候选题</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">处理抽题任务后，AI 候选题会显示在这里。</p>
            </section>
          ) : (
            candidates.map((candidate) => (
              <article key={candidate.id} className="pixel-panel grid gap-3 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{candidate.status === "confirmed" ? "已确认" : "待确认"}</span>
                  <span className="status-chip px-2 py-1">{candidate.materialTitle}</span>
                  <span className="status-chip px-2 py-1">答案 {candidate.answer}</span>
                  {candidate.difficulty ? <span className="status-chip px-2 py-1">难度 {candidate.difficulty}</span> : null}
                </div>
                <h2 className="break-words text-xl font-black">{candidate.stem}</h2>
                <div className="grid gap-2 text-sm font-bold">
                  {(["A", "B", "C", "D"] as const).map((key) => (
                    <p key={key} className="border-2 border-black bg-white p-2">
                      {key}. {candidate.options[key]}
                    </p>
                  ))}
                </div>
                {candidate.explanation ? <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold">{candidate.explanation}</p> : null}
                {candidate.status !== "confirmed" ? (
                  <form action={confirmCandidateAction}>
                    <input name="candidateId" type="hidden" value={candidate.id} />
                    <button className="pixel-button w-fit px-4 py-2" type="submit">
                      确认入题库
                    </button>
                  </form>
                ) : null}
              </article>
            ))
          )}
        </section>
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

function TextField({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} name={name} placeholder={placeholder} />
    </label>
  );
}

function SelectField({ label, name, children }: { label: string; name: string; children: React.ReactNode }) {
  return (
    <label className={labelClass}>
      {label}
      <PixelSelect className={inputClass} name={name}>
        {children}
      </PixelSelect>
    </label>
  );
}

function stateLabel(value: string) {
  return { pending: "待处理", queued: "排队中", running: "处理中", succeeded: "已完成", failed: "失败" }[value] ?? value;
}

function jobStatusLabel(value: string) {
  return { queued: "排队中", running: "运行中", succeeded: "成功", failed: "失败", canceled: "已取消" }[value] ?? value;
}

function formatBytes(value: number) {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(value / 1024)}KB`;
}
