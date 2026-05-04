import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import {
  adminPaperArchiveFilters,
  listAdminPaperQuestionOptions,
  listAdminPapers,
  paperTypeOptions,
  paperVisibilityOptions
} from "@openexam/core/paper-admin";
import { archivePaperAction, createPaperAction, restorePaperAction, updatePaperAction } from "./actions";

type AdminPapersPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    q?: string;
    subjectId?: string;
    paperType?: string;
    visibility?: string;
    archived?: string;
  }>;
};

const inputClass = "min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold";
const labelClass = "grid gap-2 text-sm font-bold";

const visibilityLabels: Record<string, string> = {
  private: "私有",
  unlisted: "未列出",
  public: "公开"
};

const paperTypeLabels: Record<string, string> = {
  sample: "样例卷",
  mock: "模拟卷",
  past: "真题卷",
  practice: "练习卷"
};

const archivedLabels: Record<string, string> = {
  active: "可用",
  archived: "已隐藏",
  all: "全部"
};

export default async function AdminPapersPage({ searchParams }: AdminPapersPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const [subjects, questionOptions, papers] = await Promise.all([listKnowledgeHierarchy(), listAdminPaperQuestionOptions(), listAdminPapers(params)]);
  const subjectOptions = subjects.map((subject) => ({
    id: subject.id,
    label: `${subject.cycle.track.program.name} / ${subject.cycle.track.name} / ${subject.cycle.name} / ${subject.name}`
  }));

  return (
    <AppShell section="admin" eyebrow="试卷治理" title="试卷">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Filters</p>
            <h2 className="mt-1 text-xl font-black">试卷筛选</h2>
          </div>
          <form className="grid gap-3 lg:grid-cols-[1.2fr_1.6fr_1fr_1fr_0.9fr_auto_auto]">
            <TextField label="关键词" name="q" defaultValue={params.q ?? ""} placeholder="标题" />
            <SelectField label="科目" name="subjectId" defaultValue={params.subjectId ?? ""}>
              <option value="">全部科目</option>
              {subjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="类型" name="paperType" defaultValue={params.paperType ?? ""}>
              <option value="">全部</option>
              {paperTypeOptions.map((paperType) => (
                <option key={paperType} value={paperType}>
                  {paperTypeLabels[paperType]}
                </option>
              ))}
            </SelectField>
            <SelectField label="可见性" name="visibility" defaultValue={params.visibility ?? ""}>
              <option value="">全部</option>
              {paperVisibilityOptions.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {visibilityLabels[visibility]}
                </option>
              ))}
            </SelectField>
            <SelectField label="状态" name="archived" defaultValue={params.archived ?? "active"}>
              {adminPaperArchiveFilters.map((archived) => (
                <option key={archived} value={archived}>
                  {archivedLabels[archived]}
                </option>
              ))}
            </SelectField>
            <button className="pixel-button self-end px-4 py-2" type="submit">
              查询
            </button>
            <Link href={"/papers" as Route} className="pixel-button self-end bg-white px-4 py-2 text-center">
              重置
            </Link>
          </form>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Paper</p>
            <h2 className="mt-1 text-xl font-black">新增试卷</h2>
          </div>
          {subjectOptions.length === 0 || questionOptions.length === 0 ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">
              请先创建考试科目和至少 1 道未归档单选题。
            </p>
          ) : (
            <PaperForm action={createPaperAction} questionOptions={questionOptions} subjectOptions={subjectOptions} submitLabel="新增试卷" />
          )}
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">试卷列表</h2>
            <span className="status-chip px-2 py-1">当前 {papers.length} 套</span>
          </div>
          {papers.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无试卷</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">创建公开试卷后，学习端会按当前考试目标展示可作答试卷。</p>
            </section>
          ) : (
            papers.map((paper) => (
              <section key={paper.id} className="pixel-panel grid gap-4 p-5">
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="status-chip px-2 py-1">{visibilityLabels[paper.visibility]}</span>
                    <span className="status-chip px-2 py-1">{paperTypeLabels[paper.paperType] ?? paper.paperType}</span>
                    <span className="status-chip px-2 py-1">{paper.questionCount} 题</span>
                    <span className="status-chip px-2 py-1">{paper.totalScore} 分</span>
                    {paper.archived ? <span className="status-chip bg-[var(--danger)] px-2 py-1 text-white">已隐藏</span> : null}
                    {paper.hasPublicRisk ? <span className="status-chip bg-[var(--danger)] px-2 py-1 text-white">公开风险</span> : null}
                  </div>
                  <h2 className="break-words text-xl font-black leading-8">{paper.title}</h2>
                  <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{paper.subjectPath}</p>
                </div>
                {paper.hasPublicRisk ? (
                  <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">
                    这套公开试卷包含未公开、未审核通过或已归档题目，学习端不会展示风险题目相关内容。
                  </p>
                ) : null}
                <PaperActions paperId={paper.id} archived={paper.archived} />
                <PaperForm
                  action={updatePaperAction}
                  id={paper.id}
                  paper={paper}
                  questionOptions={questionOptions}
                  subjectOptions={subjectOptions}
                  submitLabel="保存试卷"
                />
              </section>
            ))
          )}
        </section>
      </section>
    </AppShell>
  );
}

function PaperForm({
  action,
  id,
  paper,
  subjectOptions,
  questionOptions,
  submitLabel
}: {
  action: (formData: FormData) => void;
  id?: string;
  paper?: Awaited<ReturnType<typeof listAdminPapers>>[number];
  subjectOptions: { id: string; label: string }[];
  questionOptions: Awaited<ReturnType<typeof listAdminPaperQuestionOptions>>;
  submitLabel: string;
}) {
  const existingQuestions = new Map((paper?.questions ?? []).map((question) => [question.questionId, question]));
  const orderedQuestionOptions = [
    ...questionOptions
      .filter((question) => existingQuestions.has(question.id))
      .sort((left, right) => (existingQuestions.get(left.id)?.order ?? 0) - (existingQuestions.get(right.id)?.order ?? 0)),
    ...questionOptions.filter((question) => !existingQuestions.has(question.id))
  ];

  return (
    <form action={action} className="grid gap-4">
      {id ? <input name="id" type="hidden" value={id} /> : null}
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <TextField label="标题" name="title" defaultValue={paper?.title ?? ""} placeholder="软考软件设计师基础知识模拟卷" required />
        <TextField label="Slug" name="slug" defaultValue={paper?.slug ?? ""} placeholder="software-designer-basic-mock-1" required />
        <SelectField label="类型" name="paperType" defaultValue={paper?.paperType ?? "sample"} required>
          {paperTypeOptions.map((paperType) => (
            <option key={paperType} value={paperType}>
              {paperTypeLabels[paperType]}
            </option>
          ))}
        </SelectField>
        <SelectField label="可见性" name="visibility" defaultValue={paper?.visibility ?? "private"} required>
          {paperVisibilityOptions.map((visibility) => (
            <option key={visibility} value={visibility}>
              {visibilityLabels[visibility]}
            </option>
          ))}
        </SelectField>
      </div>
      <SelectField label="科目" name="subjectId" defaultValue={paper?.subjectId ?? ""} required>
        <option value="">选择科目</option>
        {subjectOptions.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.label}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-3">
        <p className="text-sm font-bold text-[var(--muted)]">绑定题目</p>
        {orderedQuestionOptions.map((question, index) => {
          const existing = existingQuestions.get(question.id);
          const defaultOrder = existing?.order ?? index + 1;

          return (
            <section key={question.id} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
              <label className="flex min-w-0 items-start gap-3 text-sm font-bold">
                <input className="mt-1 h-5 w-5 accent-black" defaultChecked={Boolean(existing)} name="questionId" type="checkbox" value={question.id} />
                <span className="min-w-0">
                  <span className="block break-words text-base font-black">{question.stem}</span>
                  <span className="mt-1 flex flex-wrap gap-2">
                    <span className="status-chip px-2 py-1">{existing ? "已选" : "未选"}</span>
                    <span className="status-chip px-2 py-1">{question.knowledgePath}</span>
                    <span className="status-chip px-2 py-1">{visibilityLabels[question.visibility]}</span>
                    <span className="status-chip px-2 py-1">{question.reviewStatus}</span>
                    {question.publicReady ? <span className="status-chip bg-[var(--teal)] px-2 py-1">可公开</span> : null}
                  </span>
                </span>
              </label>
              <div className="grid gap-3 lg:grid-cols-[0.7fr_0.7fr_1fr_0.7fr]">
                <TextField label="题序" name={`order_${question.id}`} defaultValue={String(defaultOrder)} required />
                <TextField label="题号" name={`number_${question.id}`} defaultValue={existing?.number ?? String(defaultOrder)} required />
                <TextField label="分区" name={`section_${question.id}`} defaultValue={existing?.section ?? ""} placeholder="基础知识" />
                <TextField label="分值" name={`score_${question.id}`} defaultValue={existing?.score?.toString() ?? "1"} required />
              </div>
            </section>
          );
        })}
      </div>
      <button className="pixel-button w-fit px-4 py-2" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}

function PaperActions({ paperId, archived }: { paperId: string; archived: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 border-2 border-black bg-[var(--surface-subtle)] p-3">
      {archived ? (
        <form action={restorePaperAction}>
          <input name="id" type="hidden" value={paperId} />
          <button className="pixel-button bg-white px-3 py-2 text-sm" type="submit">
            恢复试卷
          </button>
        </form>
      ) : (
        <form action={archivePaperAction}>
          <input name="id" type="hidden" value={paperId} />
          <button className="pixel-button bg-white px-3 py-2 text-sm" type="submit">
            隐藏试卷
          </button>
        </form>
      )}
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
      <select className={inputClass} defaultValue={defaultValue} name={name} required={required}>
        {children}
      </select>
    </label>
  );
}
