import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import { listUserMaterials } from "@openexam/core/materials";
import { FeedbackMessage, SelectField, SubmitButton, TextField } from "@openexam/core/pixel-ui";
import { uploadMaterialAction } from "./actions";

type MaterialsPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function MaterialsPage({ searchParams }: MaterialsPageProps) {
  const session = await requireWebSession();
  const [params, materials, subjects] = await Promise.all([searchParams, listUserMaterials(session.user.id), listKnowledgeHierarchy()]);
  const subjectOptions = subjects.map((subject) => ({
    id: subject.id,
    label: `${subject.cycle.track.program.name} / ${subject.cycle.track.name} / ${subject.cycle.name} / ${subject.name}`
  }));

  return (
    <AppShell section="learner" eyebrow="资料库" title="资料">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Upload</p>
            <h2 className="mt-1 text-xl font-black">上传资料</h2>
          </div>
          <form action={uploadMaterialAction} className="grid gap-3">
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <TextField label="标题" name="title" placeholder="软件设计师数据库章节笔记" />
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
            <TextField
              accept=".txt,.md,.json,.pdf,.docx,.png,.jpg,.jpeg,.webp,text/plain,text/markdown,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"
              label="文件"
              name="file"
              required
              type="file"
            />
            <SubmitButton className="w-fit px-4 py-2" label="上传并创建抽题任务" />
          </form>
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">我的资料</h2>
            <span className="status-chip px-2 py-1">当前 {materials.length} 份</span>
          </div>
          {materials.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无资料</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">上传 TXT、Markdown、JSON、PDF、DOCX 或图片后，后台可处理抽题任务并确认候选题。</p>
            </section>
          ) : (
            materials.map((material) => (
              <article key={material.id} className="pixel-panel grid gap-3 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{stateLabel(material.extractionState)}</span>
                  <span className="status-chip px-2 py-1">{formatBytes(material.sizeBytes)}</span>
                  <span className="status-chip px-2 py-1">候选 {material.candidateCount}</span>
                  <span className="status-chip px-2 py-1">入库 {material.confirmedCandidateCount}</span>
                  {material.extractionMethod ? <span className="status-chip px-2 py-1">{methodLabel(material.extractionMethod)}</span> : null}
                  {material.latestJob ? <span className="status-chip px-2 py-1">任务 {jobStatusLabel(material.latestJob.status)}</span> : null}
                </div>
                <h2 className="break-words text-xl font-black">{material.title}</h2>
                <p className="text-sm font-bold text-[var(--muted)]">{material.mimeType}</p>
                {material.extractionError || material.latestJob?.error ? <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{material.extractionError || material.latestJob?.error}</p> : null}
                {material.candidateCount > material.pendingCandidateCount ? (
                  <div className="flex flex-wrap gap-3">
                    <Link href={`/practice?material=${encodeURIComponent(material.id)}` as Route} className="pixel-button w-fit bg-white px-4 py-2">
                      练习资料题
                    </Link>
                    <Link href={`/questions?materialId=${encodeURIComponent(material.id)}&sourceType=user_uploaded` as Route} className="pixel-button w-fit bg-white px-4 py-2">
                      查看入库题
                    </Link>
                    <Link href={`/ai/chat?contextType=material&contextId=${encodeURIComponent(material.id)}` as Route} className="pixel-button w-fit bg-white px-4 py-2">
                      用资料提问
                    </Link>
                  </div>
                ) : material.candidateCount > 0 ? (
                  <div className="grid gap-3">
                    <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">候选题确认后会进入个人练习。</p>
                    <Link href={`/ai/chat?contextType=material&contextId=${encodeURIComponent(material.id)}` as Route} className="pixel-button w-fit bg-white px-4 py-2">
                      用资料提问
                    </Link>
                  </div>
                ) : (
                  <Link href={`/ai/chat?contextType=material&contextId=${encodeURIComponent(material.id)}` as Route} className="pixel-button w-fit bg-white px-4 py-2">
                    用资料提问
                  </Link>
                )}
              </article>
            ))
          )}
        </section>
      </section>
    </AppShell>
  );
}

function stateLabel(value: string) {
  return { pending: "待处理", queued: "排队中", running: "处理中", succeeded: "已完成", failed: "失败" }[value] ?? value;
}

function jobStatusLabel(value: string) {
  return { queued: "排队中", running: "运行中", succeeded: "成功", failed: "失败", canceled: "已取消" }[value] ?? value;
}

function methodLabel(value: string) {
  return { local_text: "本地文本", local_pdf: "PDF 文本", local_docx: "DOCX 文本", ai_ocr: "AI OCR" }[value] ?? value;
}

function formatBytes(value: number) {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(value / 1024)}KB`;
}
