import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import { listAdminMaterials, listMaterialQuestionCandidates, materialQuestionKinds } from "@openexam/core/materials";
import { FeedbackMessage, SelectField, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import { confirmCandidateAction, updateCandidateAction, uploadAdminMaterialAction } from "./actions";

type AdminMaterialsPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const libraryScopeLabels: Record<string, string> = {
  personal: "用户资料",
  platform: "平台资料"
};

export default async function AdminMaterialsPage({ searchParams }: AdminMaterialsPageProps) {
  await requireAdminSession();
  const [params, materials, candidates, subjects] = await Promise.all([searchParams, listAdminMaterials(), listMaterialQuestionCandidates(undefined), listKnowledgeHierarchy()]);
  const subjectOptions = subjects.map((subject) => ({
    id: subject.id,
    label: `${subject.cycle.track.program.name} / ${subject.cycle.track.name} / ${subject.cycle.name} / ${subject.name}`
  }));
  const knowledgeNodes = subjects.flatMap((subject) =>
    subject.syllabi.flatMap((syllabus) =>
      syllabus.knowledgeNodes.map((node) => ({
        id: node.id,
        label: `${subject.cycle.track.program.name} / ${subject.cycle.track.name} / ${subject.name} / ${node.code ? `${node.code} ` : ""}${node.title}`
      }))
    )
  );

  return (
    <AppShell section="admin" eyebrow="资料治理" title="资料">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

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
            <TextField
              accept=".txt,.md,.pdf,.docx,.png,.jpg,.jpeg,.webp,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"
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
                  <span className="status-chip px-2 py-1">入库 {material.confirmedCandidateCount}</span>
                  <span className="status-chip px-2 py-1">{libraryScopeLabels[material.libraryScope] ?? material.libraryScope}</span>
                  {material.extractionMethod ? <span className="status-chip px-2 py-1">{methodLabel(material.extractionMethod)}</span> : null}
                  <span className="status-chip px-2 py-1">{material.ownerEmail}</span>
                  {material.latestJob ? <span className="status-chip px-2 py-1">任务 {jobStatusLabel(material.latestJob.status)}</span> : null}
                </div>
                <h2 className="break-words text-xl font-black">{material.title}</h2>
                <p className="text-sm font-bold text-[var(--muted)]">{material.mimeType}</p>
                {material.extractionError || material.latestJob?.error ? <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{material.extractionError || material.latestJob?.error}</p> : null}
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
                  <span className="status-chip px-2 py-1">{libraryScopeLabels[candidate.materialScope] ?? candidate.materialScope}</span>
                  <span className="status-chip px-2 py-1">{candidate.kind}</span>
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
                  <div className="grid gap-3">
                    <CandidateEditForm candidate={candidate} knowledgeNodes={knowledgeNodes} />
                    <form action={confirmCandidateAction}>
                      <input name="candidateId" type="hidden" value={candidate.id} />
                      <SubmitButton className="w-fit px-4 py-2" label="确认入题库" />
                    </form>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>
      </section>
    </AppShell>
  );
}

function CandidateEditForm({
  candidate,
  knowledgeNodes
}: {
  candidate: Awaited<ReturnType<typeof listMaterialQuestionCandidates>>[number];
  knowledgeNodes: { id: string; label: string }[];
}) {
  return (
    <form action={updateCandidateAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
      <input name="candidateId" type="hidden" value={candidate.id} />
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <SelectField label="题型" name="kind" defaultValue={candidate.kind}>
          {materialQuestionKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </SelectField>
        <TextField label="答案" name="answer" defaultValue={candidate.answer} placeholder="A 或 A,C" />
        <TextField label="难度" name="difficulty" defaultValue={candidate.difficulty ? String(candidate.difficulty) : ""} placeholder="1-5" />
      </div>
      <TextareaField defaultValue={candidate.stem} label="题干" name="stem" rows={2} />
      <div className="grid gap-3 lg:grid-cols-4">
        <TextField label="选项 A" name="optionA" defaultValue={candidate.options.A} />
        <TextField label="选项 B" name="optionB" defaultValue={candidate.options.B} />
        <TextField label="选项 C" name="optionC" defaultValue={candidate.options.C} />
        <TextField label="选项 D" name="optionD" defaultValue={candidate.options.D} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <SelectField label="知识点" name="knowledgeNodeId" defaultValue={candidate.knowledgeNodeId ?? ""}>
          <option value="">未绑定</option>
          {knowledgeNodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </SelectField>
        <TextField label="来源位置" name="sourceRef" defaultValue={candidate.sourceRef ?? ""} />
      </div>
      <TextareaField defaultValue={candidate.explanation ?? ""} label="解析" name="explanation" rows={2} />
      <div className="grid gap-3 lg:grid-cols-2">
        <TextareaField defaultValue={JSON.stringify(candidate.payload, null, 2)} label="Payload JSON" name="payloadJson" rows={4} textareaClassName="font-mono" />
        <TextareaField defaultValue={JSON.stringify(candidate.answerKey, null, 2)} label="AnswerKey JSON" name="answerKeyJson" rows={4} textareaClassName="font-mono" />
      </div>
      <SubmitButton className="w-fit bg-white px-4 py-2" label="保存候选题" />
    </form>
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
