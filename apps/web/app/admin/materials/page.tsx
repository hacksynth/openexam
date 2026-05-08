import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { PaginationHeader, PaginationNav } from "@/components/pagination";
import { RichContent } from "@/components/rich-content";
import { requireAdminSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import { listAdminMaterials, listMaterialQuestionCandidateSections, materialCandidatePageSizeOptions, materialQuestionKinds, type MaterialQuestionCandidateView } from "@openexam/core/materials";
import { FeedbackMessage, SelectField, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import { confirmCandidateAction, updateCandidateAction, uploadAdminMaterialAction } from "./actions";

type AdminMaterialsPageProps = {
  searchParams: Promise<{ confirmedPage?: string; candidatePageSize?: string; error?: string; notice?: string; page?: string; pageSize?: string; pendingPage?: string }>;
};

const libraryScopeLabels: Record<string, string> = {
  personal: "用户资料",
  platform: "平台资料"
};

export default async function AdminMaterialsPage({ searchParams }: AdminMaterialsPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const [materials, candidateSections, subjects] = await Promise.all([
    listAdminMaterials(params),
    listMaterialQuestionCandidateSections({
      pendingPage: params.pendingPage,
      confirmedPage: params.confirmedPage,
      pageSize: params.candidatePageSize
    }),
    listKnowledgeHierarchy()
  ]);
  const candidatePaging = {
    pendingPage: candidateSections.pending.pagination.page,
    confirmedPage: candidateSections.confirmed.pagination.page,
    pageSize: candidateSections.pageSize
  };
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
            <span className="status-chip px-2 py-1">共 {materials.pagination.totalItems} 份</span>
          </div>
          <PaginationHeader basePath="/admin/materials" itemLabel="份" pagination={materials.pagination} params={params} />
          {materials.items.length === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无资料</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">上传资料后，可在任务页处理 AI 抽题。</p>
            </section>
          ) : (
            materials.items.map((material) => (
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
          <PaginationNav basePath="/admin/materials" pagination={materials.pagination} params={params} />
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black">候选题</h2>
            <span className="status-chip px-2 py-1">当前 {candidateSections.totalCount} 道</span>
          </div>
          {candidateSections.totalCount === 0 ? (
            <section className="pixel-panel p-5">
              <h2 className="text-2xl font-black">暂无候选题</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">处理抽题任务后，AI 候选题会显示在这里。</p>
            </section>
          ) : (
            <div className="grid gap-5">
              <CandidateListSection
                emptyMessage="暂无未确认候选题。"
                items={candidateSections.pending.items}
                knowledgeNodes={knowledgeNodes}
                pagination={candidateSections.pending.pagination}
                paging={candidatePaging}
                section="pending"
                title="未确认候选题"
              />
              <CandidateListSection
                emptyMessage="暂无已确认候选题。"
                items={candidateSections.confirmed.items}
                knowledgeNodes={knowledgeNodes}
                pagination={candidateSections.confirmed.pagination}
                paging={candidatePaging}
                section="confirmed"
                title="已确认候选题"
              />
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}

type CandidatePaging = {
  confirmedPage: number;
  pageSize: number;
  pendingPage: number;
};

type CandidateSectionName = "pending" | "confirmed";

type CandidatePagination = Awaited<ReturnType<typeof listMaterialQuestionCandidateSections>>["pending"]["pagination"];

function CandidateListSection({
  emptyMessage,
  items,
  knowledgeNodes,
  pagination,
  paging,
  section,
  title
}: {
  emptyMessage: string;
  items: MaterialQuestionCandidateView[];
  knowledgeNodes: { id: string; label: string }[];
  pagination: CandidatePagination;
  paging: CandidatePaging;
  section: CandidateSectionName;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-black">{title}</h3>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            共 {pagination.totalItems} 道 · 第 {pagination.page} / {pagination.totalPages} 页
          </p>
        </div>
        <CandidatePageSizeForm pageSize={paging.pageSize} />
      </div>
      {items.length === 0 ? (
        <section className="pixel-panel p-5">
          <p className="font-bold text-[var(--muted)]">{emptyMessage}</p>
        </section>
      ) : (
        items.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            editable={section === "pending"}
            knowledgeNodes={knowledgeNodes}
            paging={paging}
          />
        ))
      )}
      <CandidatePaginationControls pagination={pagination} paging={paging} section={section} />
    </section>
  );
}

function CandidatePageSizeForm({ pageSize }: { pageSize: number }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-2">
      <input name="pendingPage" type="hidden" value="1" />
      <input name="confirmedPage" type="hidden" value="1" />
      <SelectField defaultValue={String(pageSize)} label="每页" name="candidatePageSize" selectClassName="min-w-28">
        {materialCandidatePageSizeOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </SelectField>
      <SubmitButton className="bg-white px-3 py-2" label="应用" />
    </form>
  );
}

function CandidateCard({
  candidate,
  editable,
  knowledgeNodes,
  paging
}: {
  candidate: MaterialQuestionCandidateView;
  editable: boolean;
  knowledgeNodes: { id: string; label: string }[];
  paging: CandidatePaging;
}) {
  return (
    <article className="pixel-panel grid gap-3 p-5">
      <div className="flex flex-wrap gap-2">
        <span className="status-chip px-2 py-1">{candidateStatusLabel(candidate.status)}</span>
        <span className="status-chip px-2 py-1">{candidate.materialTitle}</span>
        <span className="status-chip px-2 py-1">{libraryScopeLabels[candidate.materialScope] ?? candidate.materialScope}</span>
        <span className="status-chip px-2 py-1">{candidate.kind}</span>
        <span className="status-chip px-2 py-1">答案 {candidate.answer}</span>
        {candidate.difficulty ? <span className="status-chip px-2 py-1">难度 {candidate.difficulty}</span> : null}
      </div>
      <RichContent blocks={readPayloadBlocks(candidate.payload, "stemBlocks")} fallback={candidate.stem} textClassName="text-xl font-black" />
      <div className="grid gap-2 text-sm font-bold">
        {(["A", "B", "C", "D"] as const).map((key) => (
          <div key={key} className="border-2 border-black bg-white p-2">
            <span className="mr-2 font-black">{key}.</span>
            <RichContent blocks={readCandidateOptionBlocks(candidate.payload, key)} fallback={candidate.options[key]} inline textClassName="font-bold" />
          </div>
        ))}
      </div>
      {candidate.explanation || readPayloadBlocks(candidate.payload, "explanationBlocks") ? (
        <div className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold">
          <RichContent blocks={readPayloadBlocks(candidate.payload, "explanationBlocks")} fallback={candidate.explanation} textClassName="leading-7" />
        </div>
      ) : null}
      {readPayloadBlocks(candidate.payload, "referenceAnswerBlocks") || readPayloadText(candidate.payload, "referenceAnswer") ? (
        <div className="border-2 border-black bg-white p-3 text-sm font-bold">
          <p className="mb-2 text-[var(--muted)]">参考答案</p>
          <RichContent blocks={readPayloadBlocks(candidate.payload, "referenceAnswerBlocks")} fallback={readPayloadText(candidate.payload, "referenceAnswer")} textClassName="leading-7" />
        </div>
      ) : null}
      <ImageImportWarnings payload={candidate.payload} />
      {editable ? (
        <div className="grid gap-3">
          <CandidateEditForm candidate={candidate} knowledgeNodes={knowledgeNodes} paging={paging} />
          <form action={confirmCandidateAction}>
            <input name="candidateId" type="hidden" value={candidate.id} />
            <CandidatePagingInputs paging={paging} />
            <SubmitButton className="w-fit px-4 py-2" label="确认入题库" />
          </form>
        </div>
      ) : null}
    </article>
  );
}

function ImageImportWarnings({ payload }: { payload: unknown }) {
  const warnings = readImageImportWarnings(payload);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="border-2 border-black bg-yellow-50 p-3 text-sm font-bold text-yellow-900">
      <p>部分外链图片未导入平台资产，后续 AI 解析可能不可用。</p>
      <ul className="mt-2 grid gap-1">
        {warnings.map((warning, index) => (
          <li className="break-words" key={`${warning.sourceUrl}-${index}`}>
            {warning.scope}：{warning.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CandidateEditForm({
  candidate,
  knowledgeNodes,
  paging
}: {
  candidate: MaterialQuestionCandidateView;
  knowledgeNodes: { id: string; label: string }[];
  paging: CandidatePaging;
}) {
  return (
    <form action={updateCandidateAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
      <input name="candidateId" type="hidden" value={candidate.id} />
      <CandidatePagingInputs paging={paging} />
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

function CandidatePagingInputs({ paging }: { paging: CandidatePaging }) {
  return (
    <>
      <input name="pendingPage" type="hidden" value={paging.pendingPage} />
      <input name="confirmedPage" type="hidden" value={paging.confirmedPage} />
      <input name="candidatePageSize" type="hidden" value={paging.pageSize} />
    </>
  );
}

function CandidatePaginationControls({
  pagination,
  paging,
  section
}: {
  pagination: CandidatePagination;
  paging: CandidatePaging;
  section: CandidateSectionName;
}) {
  if (pagination.totalItems === 0) {
    return null;
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-2" aria-label={`${section === "pending" ? "未确认" : "已确认"}候选题分页`}>
      <CandidatePageLink disabled={!pagination.hasPreviousPage} href={buildCandidatePageHref(section, paging, pagination.previousPage ?? pagination.page)}>
        上一页
      </CandidatePageLink>
      <CandidatePageLink disabled={!pagination.hasNextPage} href={buildCandidatePageHref(section, paging, pagination.nextPage ?? pagination.page)}>
        下一页
      </CandidatePageLink>
    </nav>
  );
}

function CandidatePageLink({ children, disabled, href }: { children: ReactNode; disabled: boolean; href: Route }) {
  const className = `pixel-button bg-white px-4 py-2 text-sm ${disabled ? "pointer-events-none opacity-50" : ""}`;

  return disabled ? (
    <span aria-disabled="true" className={className}>
      {children}
    </span>
  ) : (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

function buildCandidatePageHref(section: CandidateSectionName, paging: CandidatePaging, page: number): Route {
  const pendingPage = section === "pending" ? page : paging.pendingPage;
  const confirmedPage = section === "confirmed" ? page : paging.confirmedPage;

  return `/admin/materials?pendingPage=${pendingPage}&confirmedPage=${confirmedPage}&candidatePageSize=${paging.pageSize}` as Route;
}

function stateLabel(value: string) {
  return { pending: "待处理", queued: "排队中", running: "处理中", succeeded: "已完成", failed: "失败" }[value] ?? value;
}

function candidateStatusLabel(value: string) {
  return { confirmed: "已确认", needs_changes: "需修改", pending: "待确认", rejected: "已忽略" }[value] ?? value;
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

function readPayloadBlocks(payload: unknown, key: string) {
  return isRecord(payload) ? payload[key] : null;
}

function readPayloadText(payload: unknown, key: string) {
  const value = isRecord(payload) ? payload[key] : null;

  return typeof value === "string" ? value : null;
}

function readCandidateOptionBlocks(payload: unknown, key: string) {
  if (!isRecord(payload) || !Array.isArray(payload.options)) {
    return null;
  }

  const option = payload.options.find((item) => isRecord(item) && item.key === key);

  return isRecord(option) ? option.blocks : null;
}

function readImageImportWarnings(payload: unknown) {
  const warnings = isRecord(payload) && Array.isArray(payload.imageImportWarnings) ? payload.imageImportWarnings : [];

  return warnings
    .map((warning) => {
      if (!isRecord(warning)) {
        return null;
      }

      const sourceUrl = typeof warning.sourceUrl === "string" ? warning.sourceUrl : "";
      const scope = typeof warning.scope === "string" ? warning.scope : "图片";
      const reason = typeof warning.reason === "string" ? warning.reason : "";

      return sourceUrl && reason ? { sourceUrl, scope, reason } : null;
    })
    .filter((warning): warning is { reason: string; scope: string; sourceUrl: string } => Boolean(warning));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
