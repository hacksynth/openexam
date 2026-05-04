import { AppShell } from "@/components/app-shell";
import { PixelSelect } from "@openexam/core/pixel-select";
import { requireAdminSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import {
  createKnowledgeNodeAction,
  createSyllabusAction,
  updateKnowledgeNodeAction,
  updateSyllabusAction
} from "./actions";

type KnowledgePageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const inputClass = "min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold";
const labelClass = "grid gap-2 text-sm font-bold";

export default async function AdminKnowledgePage({ searchParams }: KnowledgePageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const subjects = await listKnowledgeHierarchy();
  const syllabi = subjects.flatMap((subject) =>
    subject.syllabi.map((syllabus) => ({
      ...syllabus,
      subject
    }))
  );

  return (
    <AppShell section="admin" eyebrow="Exam Core" title="知识">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Syllabus</p>
            <h2 className="mt-1 text-xl font-black">大纲</h2>
          </div>
          <form action={createSyllabusAction} className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
            <SelectField label="科目" name="subjectId" required>
              <option value="">选择科目</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.cycle.track.program.name} / {subject.cycle.track.name} / {subject.cycle.name} / {subject.name}
                </option>
              ))}
            </SelectField>
            <TextField label="大纲名称" name="name" placeholder="软件设计师 MVP 大纲" required />
            <TextField label="版本" name="version" placeholder="mvp" required />
            <SubmitButton label="新增大纲" />
          </form>
          <div className="grid gap-3">
            {syllabi.map((syllabus) => (
              <form key={syllabus.id} action={updateSyllabusAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
                <input name="id" type="hidden" value={syllabus.id} />
                <p className="self-end truncate pb-2 text-sm font-bold text-[var(--muted)]" title={`${syllabus.subject.cycle.track.name} / ${syllabus.subject.cycle.name} / ${syllabus.subject.name}`}>
                  {syllabus.subject.cycle.track.name} / {syllabus.subject.name}
                </p>
                <TextField label="大纲名称" name="name" defaultValue={syllabus.name} required />
                <TextField label="版本" name="version" defaultValue={syllabus.version} required />
                <SubmitButton label="保存" />
              </form>
            ))}
          </div>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Knowledge Tree</p>
            <h2 className="mt-1 text-xl font-black">知识点</h2>
          </div>
          <form action={createKnowledgeNodeAction} className="grid gap-3 lg:grid-cols-[1.2fr_1.2fr_0.8fr_1fr_auto]">
            <SelectField label="大纲" name="syllabusId" required>
              <option value="">选择大纲</option>
              {syllabi.map((syllabus) => (
                <option key={syllabus.id} value={syllabus.id}>
                  {syllabus.subject.name} / {syllabus.name} ({syllabus.version})
                </option>
              ))}
            </SelectField>
            <SelectField label="父级" name="parentId">
              <option value="">顶层知识点</option>
              {syllabi.flatMap((syllabus) =>
                syllabus.knowledgeNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {syllabus.subject.name} / {node.code ? `${node.code} ` : ""}
                    {node.title}
                  </option>
                ))
              )}
            </SelectField>
            <TextField label="编码" name="code" placeholder="DS-ALGO-001" />
            <TextField label="标题" name="title" placeholder="算法复杂度" required />
            <SubmitButton label="新增知识点" />
            <label className={`${labelClass} lg:col-span-2`}>
              描述
              <textarea className={inputClass} name="description" placeholder="知识点说明" rows={3} />
            </label>
            <label className={`${labelClass} lg:col-span-3`}>
              考试要求
              <textarea className={inputClass} name="examExpectation" placeholder="考试中常见考查方式" rows={3} />
            </label>
          </form>
        </section>

        {syllabi.map((syllabus) => (
          <section key={syllabus.id} className="pixel-panel grid gap-4 p-5">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">
                {syllabus.subject.cycle.track.program.name} / {syllabus.subject.cycle.track.name} / {syllabus.subject.name}
              </p>
              <h2 className="mt-1 text-xl font-black">
                {syllabus.name} ({syllabus.version})
              </h2>
            </div>
            {syllabus.knowledgeNodes.length === 0 ? (
              <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">暂无知识点。</p>
            ) : (
              <div className="grid gap-3">
                {syllabus.knowledgeNodes.map((node) => (
                  <form key={node.id} action={updateKnowledgeNodeAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1fr_1fr_0.8fr_1fr_auto]">
                    <input name="id" type="hidden" value={node.id} />
                    <SelectField label="父级" name="parentId" defaultValue={node.parentId ?? ""}>
                      <option value="">顶层知识点</option>
                      {syllabus.knowledgeNodes
                        .filter((candidate) => candidate.id !== node.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.code ? `${candidate.code} ` : ""}
                            {candidate.title}
                          </option>
                        ))}
                    </SelectField>
                    <p className="self-end truncate pb-2 text-sm font-bold text-[var(--muted)]" title={node.parentId ? parentTitle(syllabus.knowledgeNodes, node.parentId) : "顶层知识点"}>
                      {node.parentId ? parentTitle(syllabus.knowledgeNodes, node.parentId) : "顶层知识点"}
                    </p>
                    <TextField label="编码" name="code" defaultValue={node.code ?? ""} />
                    <TextField label="标题" name="title" defaultValue={node.title} required />
                    <SubmitButton label="保存" />
                    <label className={`${labelClass} lg:col-span-2`}>
                      描述
                      <textarea className={inputClass} defaultValue={node.description ?? ""} name="description" rows={3} />
                    </label>
                    <label className={`${labelClass} lg:col-span-3`}>
                      考试要求
                      <textarea className={inputClass} defaultValue={node.examExpectation ?? ""} name="examExpectation" rows={3} />
                    </label>
                  </form>
                ))}
              </div>
            )}
          </section>
        ))}
      </section>
    </AppShell>
  );
}

function parentTitle(nodes: { id: string; code: string | null; title: string }[], parentId: string) {
  const parent = nodes.find((node) => node.id === parentId);

  return parent ? `${parent.code ? `${parent.code} ` : ""}${parent.title}` : "未知父级";
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

function TextField({
  label,
  name,
  defaultValue = "",
  placeholder,
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} defaultValue={defaultValue} name={name} placeholder={placeholder} required={required} />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  required = false,
  children
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={labelClass}>
      {label}
      <PixelSelect className={inputClass} defaultValue={defaultValue} name={name} required={required}>
        {children}
      </PixelSelect>
    </label>
  );
}

function SubmitButton({ label }: { label: string }) {
  return (
    <button className="pixel-button self-end px-4 py-2 text-sm" type="submit">
      {label}
    </button>
  );
}
