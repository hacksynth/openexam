import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { PaginationHeader, PaginationNav } from "@/components/pagination";
import { requireWebSession } from "@/lib/auth";
import { getLearningAnalysis } from "@openexam/core/analysis";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import { listGeneratedQuestionBatches } from "@openexam/core/generated-questions";
import { FeedbackMessage, SelectField, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import { confirmGeneratedQuestionCandidateAction, generatePracticeQuestionCandidatesAction, rejectGeneratedQuestionCandidateAction } from "./actions";

type GeneratePracticePageProps = {
  searchParams: Promise<{ error?: string; notice?: string; page?: string; pageSize?: string }>;
};

export default async function GeneratePracticePage({ searchParams }: GeneratePracticePageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const [batches, subjects, analysis] = await Promise.all([listGeneratedQuestionBatches(session.user.id, params), listKnowledgeHierarchy(), getLearningAnalysis(session.user.id)]);
  const knowledgeOptions =
    analysis.status === "ready"
      ? subjects
          .filter((subject) => subjectMatchesGoal(subject, analysis.goal))
          .flatMap((subject) =>
            subject.syllabi.flatMap((syllabus) =>
              syllabus.knowledgeNodes.map((node) => ({
                id: node.id,
                label: `${subject.cycle.track.program.name} / ${subject.name} / ${node.code ? `${node.code} ` : ""}${node.title}`
              }))
            )
          )
      : [];

  return (
    <AppShell section="learner" eyebrow="AI 生成练习题" title="AI 出题">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Generate</p>
            <h2 className="mt-1 text-xl font-black">生成候选练习题</h2>
          </div>
          {analysis.status === "no_goal" ? (
            <div className="grid gap-3">
              <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">请先设置主考试目标，再生成练习题。</p>
              <Link href={"/goals" as Route} className="pixel-button w-fit px-4 py-2">
                设置目标
              </Link>
            </div>
          ) : (
            <form action={generatePracticeQuestionCandidatesAction} className="grid gap-3">
              <TextareaField label="想练什么内容？" name="prompt" placeholder="例如：我想练数据库事务隔离级别，多出应用题，重点覆盖容易混淆的概念" required textareaClassName="min-h-24" />
              <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
                <SelectField label="知识点" name="knowledgeNodeId">
                  <option value="">由 AI 从当前目标中选择</option>
                  {knowledgeOptions.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </SelectField>
                <TextField defaultValue="3" label="题数" max="8" min="1" name="count" type="number" />
              </div>
              <SubmitButton className="w-fit px-4 py-2" label="生成候选题" />
            </form>
          )}
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">候选批次</h2>
            <Link href={"/practice" as Route} className="pixel-button bg-white px-4 py-2">
              去练习
            </Link>
          </div>
          <PaginationHeader basePath="/practice/generate" itemLabel="批" pagination={batches.pagination} params={params} />
          {batches.items.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无候选题</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">生成后的题目需要确认，确认前不会进入练习。</p>
            </section>
          ) : (
            batches.items.map((batch) => (
              <article key={batch.id} className="pixel-panel grid gap-4 p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="status-chip px-2 py-1">{statusLabel(batch.status)}</span>
                  <span className="status-chip px-2 py-1">候选 {batch.candidates.length}</span>
                  {batch.goalPath ? <span className="status-chip px-2 py-1">{batch.goalPath}</span> : null}
                </div>
                <h3 className="break-words text-lg font-black">{batch.prompt}</h3>
                {batch.errorSummary ? <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{batch.errorSummary}</p> : null}
                <div className="grid gap-3">
                  {batch.candidates.map((candidate) => (
                    <section key={candidate.id} className="grid gap-3 border-2 border-black bg-white p-3">
                      <div className="flex flex-wrap gap-2">
                        <span className="status-chip px-2 py-1">{candidate.kind}</span>
                        <span className="status-chip px-2 py-1">{statusLabel(candidate.status)}</span>
                        {candidate.difficulty ? <span className="status-chip px-2 py-1">难度 {candidate.difficulty}</span> : null}
                      </div>
                      <h4 className="break-words font-black">{candidate.stem}</h4>
                      <pre className="overflow-x-auto border-2 border-black bg-[var(--surface-subtle)] p-3 text-xs font-bold">{JSON.stringify({ payload: candidate.payload, answerKey: candidate.answerKey }, null, 2)}</pre>
                      {candidate.explanation ? <p className="text-sm font-bold leading-6 text-[var(--muted)]">{candidate.explanation}</p> : null}
                      {candidate.status === "pending" ? (
                        <div className="flex flex-wrap gap-3">
                          <form action={confirmGeneratedQuestionCandidateAction} className="flex flex-wrap items-end gap-3">
                            <input name="candidateId" type="hidden" value={candidate.id} />
                            <SelectField defaultValue={candidate.knowledgeNodeId ?? ""} label="知识点" name="knowledgeNodeId">
                              <option value="">选择知识点</option>
                              {knowledgeOptions.map((node) => (
                                <option key={node.id} value={node.id}>
                                  {node.label}
                                </option>
                              ))}
                            </SelectField>
                            <SubmitButton className="px-4 py-2" label="确认入库" />
                          </form>
                          <form action={rejectGeneratedQuestionCandidateAction}>
                            <input name="candidateId" type="hidden" value={candidate.id} />
                            <SubmitButton className="bg-white px-4 py-2" label="忽略" />
                          </form>
                        </div>
                      ) : candidate.confirmedQuestionId ? (
                        <Link href={"/practice" as Route} className="pixel-button w-fit bg-white px-4 py-2">
                          练习已确认题
                        </Link>
                      ) : null}
                    </section>
                  ))}
                </div>
              </article>
            ))
          )}
          <PaginationNav basePath="/practice/generate" pagination={batches.pagination} params={params} />
        </section>
      </section>
    </AppShell>
  );
}

function statusLabel(value: string) {
  return { running: "生成中", succeeded: "已完成", failed: "失败", pending: "待确认", confirmed: "已确认", rejected: "已忽略" }[value] ?? value;
}

function subjectMatchesGoal(subject: Awaited<ReturnType<typeof listKnowledgeHierarchy>>[number], goal: Extract<Awaited<ReturnType<typeof getLearningAnalysis>>, { status: "ready" }>["goal"]) {
  if (goal.subjectId) {
    return subject.id === goal.subjectId;
  }

  if (goal.cycleId) {
    return subject.cycleId === goal.cycleId;
  }

  if (goal.trackId) {
    return subject.cycle.trackId === goal.trackId;
  }

  return subject.cycle.track.programId === goal.programId;
}
