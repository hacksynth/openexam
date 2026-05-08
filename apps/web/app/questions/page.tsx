import Link from "next/link";
import type { Route } from "next";
import { listUserQuestionBank, userQuestionBankSourceFilters } from "@openexam/core/question-bank";
import { SelectField, SubmitButton } from "@openexam/core/pixel-ui";
import { AppShell } from "@/components/app-shell";
import { PaginationHeader, PaginationNav } from "@/components/pagination";
import { requireWebSession } from "@/lib/auth";

type QuestionsPageProps = {
  searchParams: Promise<{
    sourceType?: string;
    materialId?: string;
    page?: string;
    pageSize?: string;
  }>;
};

const sourceTypeLabels: Record<string, string> = {
  all: "全部来源",
  user_uploaded: "资料上传",
  ai_generated: "AI 生成"
};

const questionKindLabels: Record<string, string> = {
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  blank: "填空",
  short_answer: "简答",
  case_analysis: "案例"
};

const reviewStatusLabels: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  needs_changes: "需修改",
  takedown: "已下架"
};

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const state = await listUserQuestionBank(session.user.id, params);

  return (
    <AppShell section="learner" eyebrow="我的题库" title="我的题库">
      <section className="grid gap-5">
        <section className="pixel-panel grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--muted)]">Question Bank</p>
              <h2 className="mt-1 text-xl font-black">{state.material ? state.material.title : "我的私有题"}</h2>
            </div>
            <span className="status-chip px-2 py-1">共 {state.pagination.totalItems} 题</span>
          </div>
          <form className="flex flex-wrap items-end gap-3">
            {params.materialId ? <input name="materialId" type="hidden" value={params.materialId} /> : null}
            <input name="page" type="hidden" value="1" />
            {params.pageSize ? <input name="pageSize" type="hidden" value={params.pageSize} /> : null}
            <SelectField label="来源" name="sourceType" defaultValue={state.sourceType}>
              {userQuestionBankSourceFilters.map((sourceType) => (
                <option key={sourceType} value={sourceType}>
                  {sourceTypeLabels[sourceType]}
                </option>
              ))}
            </SelectField>
            <SubmitButton className="px-4 py-2" label="筛选" />
            <Link href={"/questions" as Route} className="pixel-button bg-white px-4 py-2">
              全部私有题
            </Link>
          </form>
        </section>

        <PaginationHeader basePath="/questions" itemLabel="题" pagination={state.pagination} params={params} />

        {state.materialUnavailable ? (
          <section className="pixel-panel p-5">
            <h2 className="text-2xl font-black">资料不可用</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">该资料不存在，或不属于当前账号。</p>
          </section>
        ) : state.questions.length === 0 ? (
          <section className="pixel-panel p-5">
            <h2 className="text-2xl font-black">暂无私有题</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">资料候选题或 AI 候选题确认入库后会显示在这里。</p>
          </section>
        ) : (
          <section className="grid gap-4">
            {state.questions.map((question) => (
              <article key={question.id} className="pixel-panel grid gap-4 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">我的题库</span>
                  <span className="status-chip px-2 py-1">{sourceTypeLabels[question.sourceType] ?? question.sourceType}</span>
                  <span className="status-chip px-2 py-1">{questionKindLabels[question.kind] ?? question.kind}</span>
                  <span className="status-chip px-2 py-1">{reviewStatusLabels[question.reviewStatus] ?? question.reviewStatus}</span>
                  {question.difficulty ? <span className="status-chip px-2 py-1">难度 {question.difficulty}</span> : null}
                  {question.materialTitle ? <span className="status-chip px-2 py-1">{question.materialTitle}</span> : null}
                </div>
                <div>
                  <h2 className="break-words text-xl font-black leading-8">{question.stem}</h2>
                  <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">{question.knowledgePath}</p>
                  {question.sourceTitle ? <p className="mt-1 break-words text-sm font-bold text-[var(--muted)]">来源：{question.sourceTitle}</p> : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href={`/practice?question=${question.id}` as Route} className="pixel-button px-4 py-2">
                    练这题
                  </Link>
                  {question.materialId ? (
                    <Link href={`/practice?material=${encodeURIComponent(question.materialId)}&question=${question.id}` as Route} className="pixel-button bg-white px-4 py-2">
                      资料练习
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        )}
        <PaginationNav basePath="/questions" pagination={state.pagination} params={params} />
      </section>
    </AppShell>
  );
}
