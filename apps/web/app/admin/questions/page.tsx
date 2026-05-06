import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import { FeedbackMessage, SelectField, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import {
  adminQuestionKindOptions,
  adminQuestionArchiveFilters,
  listAdminQuestions,
  questionReviewStatusOptions,
  questionSourceTypeOptions,
  questionVisibilityOptions
} from "@openexam/core/question-admin";
import {
  archiveAdminQuestionAction,
  createAdminQuestionAction,
  importAdminQuestionsAction,
  restoreAdminQuestionAction,
  updateAdminQuestionReviewStatusAction,
  updateAdminQuestionAction
} from "./actions";

type QuestionsPageProps = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    q?: string;
    kind?: string;
    knowledgeNodeId?: string;
    visibility?: string;
    sourceType?: string;
    reviewStatus?: string;
    difficulty?: string;
    archived?: string;
  }>;
};

const visibilityLabels: Record<string, string> = {
  private: "私有",
  unlisted: "未列出",
  public: "公开"
};

const sourceTypeLabels: Record<string, string> = {
  original: "原创",
  authorized: "授权",
  public_domain_or_open: "公开开放",
  user_uploaded: "用户上传",
  ai_generated: "AI 生成",
  unknown: "未知来源"
};

const reviewStatusLabels: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  needs_changes: "需修改",
  takedown: "已下架"
};

const ownershipLabels: Record<string, string> = {
  platform: "平台题库",
  user_private: "用户私有"
};

const questionKindLabels: Record<string, string> = {
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  blank: "填空",
  short_answer: "简答",
  case_analysis: "案例"
};

const answerPresetOptions = [
  "A",
  "B",
  "C",
  "D",
  "A,B",
  "A,C",
  "A,D",
  "B,C",
  "B,D",
  "C,D",
  "A,B,C",
  "A,B,D",
  "A,C,D",
  "B,C,D",
  "A,B,C,D",
  "true",
  "false"
] as const;

const archivedLabels: Record<string, string> = {
  active: "未归档",
  archived: "已归档",
  all: "全部"
};

export default async function AdminQuestionsPage({ searchParams }: QuestionsPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const [subjects, questions] = await Promise.all([listKnowledgeHierarchy(), listAdminQuestions(params)]);
  const knowledgeNodes = subjects.flatMap((subject) =>
    subject.syllabi.flatMap((syllabus) =>
      syllabus.knowledgeNodes.map((node) => ({
        id: node.id,
        label: `${subject.cycle.track.program.name} / ${subject.cycle.track.name} / ${subject.name} / ${node.code ? `${node.code} ` : ""}${node.title}`
      }))
    )
  );

  return (
    <AppShell section="admin" eyebrow="题库治理" title="题目">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Filters</p>
            <h2 className="mt-1 text-xl font-black">题目筛选</h2>
          </div>
          <form className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1.6fr_1fr_1fr_1fr_0.8fr_0.9fr_auto_auto]">
            <TextField label="关键词" name="q" defaultValue={params.q ?? ""} placeholder="题干" />
            <SelectField label="题型" name="kind" defaultValue={params.kind ?? ""}>
              <option value="">全部题型</option>
              {adminQuestionKindOptions.map((kind) => (
                <option key={kind} value={kind}>
                  {questionKindLabels[kind]}
                </option>
              ))}
            </SelectField>
            <SelectField label="知识点" name="knowledgeNodeId" defaultValue={params.knowledgeNodeId ?? ""}>
              <option value="">全部知识点</option>
              {knowledgeNodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="可见性" name="visibility" defaultValue={params.visibility ?? ""}>
              <option value="">全部</option>
              {questionVisibilityOptions.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {visibilityLabels[visibility]}
                </option>
              ))}
            </SelectField>
            <SelectField label="审核" name="reviewStatus" defaultValue={params.reviewStatus ?? ""}>
              <option value="">全部</option>
              {questionReviewStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {reviewStatusLabels[status]}
                </option>
              ))}
            </SelectField>
            <SelectField label="来源" name="sourceType" defaultValue={params.sourceType ?? ""}>
              <option value="">全部</option>
              {questionSourceTypeOptions.map((sourceType) => (
                <option key={sourceType} value={sourceType}>
                  {sourceTypeLabels[sourceType]}
                </option>
              ))}
            </SelectField>
            <TextField label="难度" name="difficulty" defaultValue={params.difficulty ?? ""} placeholder="1-5" />
            <SelectField label="归档" name="archived" defaultValue={params.archived ?? "active"}>
              {adminQuestionArchiveFilters.map((archived) => (
                <option key={archived} value={archived}>
                  {archivedLabels[archived]}
                </option>
              ))}
            </SelectField>
            <SubmitButton className="px-4 py-2" label="查询" />
            <Link href={"/admin/questions" as Route} className="pixel-button self-end bg-white px-4 py-2 text-center">
              重置
            </Link>
          </form>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Question</p>
            <h2 className="mt-1 text-xl font-black">新增题目</h2>
          </div>
          {knowledgeNodes.length === 0 ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">请先在知识页创建大纲和知识点。</p>
          ) : (
            <QuestionForm action={createAdminQuestionAction} knowledgeNodes={knowledgeNodes} submitLabel="新增题目" />
          )}
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Import</p>
            <h2 className="mt-1 text-xl font-black">JSON 批量导入</h2>
          </div>
          {knowledgeNodes.length === 0 ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">请先在知识页创建大纲和知识点。</p>
          ) : (
            <ImportForm />
          )}
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">题目列表</h2>
            <span className="status-chip px-2 py-1">当前 {questions.length} 题</span>
          </div>
          {questions.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无题目</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">创建题目后，学习端练习会按目标范围读取公开且审核通过的题目。</p>
            </section>
          ) : (
            questions.map((question) => (
              <section key={question.id} className="pixel-panel grid gap-4 p-5">
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="status-chip px-2 py-1">{ownershipLabels[question.ownership]}</span>
                    <span className="status-chip px-2 py-1">{visibilityLabels[question.visibility]}</span>
                    <span className="status-chip px-2 py-1">{sourceTypeLabels[question.sourceType]}</span>
                    <span className="status-chip px-2 py-1">{reviewStatusLabels[question.reviewStatus]}</span>
                    <span className="status-chip px-2 py-1">{questionKindLabels[question.kind]}</span>
                    {question.archived ? <span className="status-chip bg-[var(--danger)] px-2 py-1 text-white">已归档</span> : null}
                    <span className="status-chip px-2 py-1">V{question.currentVersion}</span>
                    {question.ownerEmail ? <span className="status-chip px-2 py-1">{question.ownerEmail}</span> : null}
                  </div>
                  <h2 className="break-words text-xl font-black leading-8">{question.stem}</h2>
                  <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{question.knowledgePath}</p>
                </div>
                <QuestionActions questionId={question.id} archived={question.archived} />
                <QuestionForm
                  action={updateAdminQuestionAction}
                  id={question.id}
                  knowledgeNodes={knowledgeNodes}
                  question={question}
                  submitLabel="保存题目"
                />
              </section>
            ))
          )}
        </section>
      </section>
    </AppShell>
  );
}

function ImportForm() {
  return (
    <form action={importAdminQuestionsAction} className="grid gap-3">
      <TextareaField
        label="JSON 内容"
        name="jsonPayload"
        placeholder='[{"kind":"multiple_choice","stem":"题干","options":{"A":"选项A","B":"选项B","C":"选项C","D":"选项D"},"answer":["A","B"],"knowledgeNodeId":"...","visibility":"private","sourceType":"original","reviewStatus":"draft"}]'
        required
        rows={7}
        textareaClassName="font-mono"
      />
      <SubmitButton className="w-fit px-4 py-2" label="导入题目" />
    </form>
  );
}

function QuestionForm({
  action,
  id,
  question,
  knowledgeNodes,
  submitLabel
}: {
  action: (formData: FormData) => void;
  id?: string;
  question?: Awaited<ReturnType<typeof listAdminQuestions>>[number];
  knowledgeNodes: { id: string; label: string }[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4">
      {id ? <input name="id" type="hidden" value={id} /> : null}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <SelectField label="题型" name="kind" defaultValue={question?.kind ?? "single_choice"} required>
          {adminQuestionKindOptions.map((kind) => (
            <option key={kind} value={kind}>
              {questionKindLabels[kind]}
            </option>
          ))}
        </SelectField>
        <TextField label="难度" name="difficulty" defaultValue={question?.difficulty?.toString() ?? ""} placeholder="1-5" />
        <SelectField label="审核状态" name="reviewStatus" defaultValue={question?.reviewStatus ?? "draft"} required>
          {questionReviewStatusOptions.map((status) => (
            <option key={status} value={status}>
              {reviewStatusLabels[status]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextareaField defaultValue={question?.stem ?? ""} label="题干" name="stem" placeholder="输入题干" required rows={3} />
      <div className="grid gap-3 lg:grid-cols-2">
        <TextField label="选项 A（选择题）" name="optionA" defaultValue={question?.optionA ?? ""} />
        <TextField label="选项 B（选择题）" name="optionB" defaultValue={question?.optionB ?? ""} />
        <TextField label="选项 C（选择题）" name="optionC" defaultValue={question?.optionC ?? ""} />
        <TextField label="选项 D（选择题）" name="optionD" defaultValue={question?.optionD ?? ""} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_1fr]">
        <SelectField label="答案模板" name="answer" defaultValue={answerPresetDefault(question?.answer)} required>
          {answerPresetOptions.map((answer) => (
            <option key={answer} value={answer}>
              {answer}
            </option>
          ))}
        </SelectField>
        <TextField
          label="填空 / 主观参考答案"
          name="answerText"
          defaultValue={answerTextDefault(question?.answer)}
          placeholder="需要自由文本时填写"
        />
        <SelectField label="可见性" name="visibility" defaultValue={question?.visibility ?? "private"} required>
          {questionVisibilityOptions.map((visibility) => (
            <option key={visibility} value={visibility}>
              {visibilityLabels[visibility]}
            </option>
          ))}
        </SelectField>
        <SelectField label="来源类型" name="sourceType" defaultValue={question?.sourceType ?? "original"} required>
          {questionSourceTypeOptions.map((sourceType) => (
            <option key={sourceType} value={sourceType}>
              {sourceTypeLabels[sourceType]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <SelectField label="主知识点" name="knowledgeNodeId" defaultValue={question?.knowledgeNodeId ?? ""} required>
          <option value="">选择知识点</option>
          {knowledgeNodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </SelectField>
        <TextField label="answerKey JSON（可选）" name="answerKeyJson" defaultValue={question?.answerKeyJson ?? ""} placeholder='{"values":["A","B"]}' />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <TextField label="来源标题" name="sourceTitle" defaultValue={question?.sourceTitle ?? ""} placeholder="教材 / 真题 / 用户资料标题" />
        <TextField label="来源 URL" name="sourceUrl" defaultValue={question?.sourceUrl ?? ""} placeholder="https://..." />
        <TextField label="来源许可" name="sourceLicense" defaultValue={question?.sourceLicense ?? ""} placeholder="原创 / 授权 / CC BY" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <TextareaField defaultValue={question?.payloadJson ?? ""} label="payload JSON（非选择题可选）" name="payloadJson" placeholder='{"hints":[]}' rows={3} textareaClassName="font-mono" />
        <TextareaField defaultValue={question?.rubricJson ?? ""} label="rubric JSON（主观题可选）" name="rubricJson" placeholder='{"points":["要点1","要点2"]}' rows={3} textareaClassName="font-mono" />
      </div>
      <TextareaField defaultValue={question?.explanation ?? ""} label="解析" name="explanation" placeholder="解释正确答案和关键知识点" rows={3} />
      <SubmitButton className="w-fit px-4 py-2" label={submitLabel} />
    </form>
  );
}

function QuestionActions({ questionId, archived }: { questionId: string; archived: boolean }) {
  return (
    <div className="flex flex-wrap gap-2 border-2 border-black bg-[var(--surface-subtle)] p-3">
      {archived ? (
        <form action={restoreAdminQuestionAction}>
          <input name="id" type="hidden" value={questionId} />
          <SubmitButton className="bg-white px-3 py-2" label="恢复题目" />
        </form>
      ) : (
        <>
          {questionReviewStatusOptions.map((status) => (
            <form key={status} action={updateAdminQuestionReviewStatusAction}>
              <input name="id" type="hidden" value={questionId} />
              <input name="reviewStatus" type="hidden" value={status} />
              <SubmitButton className="bg-white px-3 py-2" label={`设为${reviewStatusLabels[status]}`} />
            </form>
          ))}
          <form action={archiveAdminQuestionAction}>
            <input name="id" type="hidden" value={questionId} />
            <SubmitButton className="bg-white px-3 py-2" label="归档题目" />
          </form>
        </>
      )}
    </div>
  );
}

function answerPresetDefault(value: string | undefined) {
  return answerPresetOptions.includes(value as (typeof answerPresetOptions)[number]) ? value : "A";
}

function answerTextDefault(value: string | undefined) {
  return value && !answerPresetOptions.includes(value as (typeof answerPresetOptions)[number]) ? value : "";
}
