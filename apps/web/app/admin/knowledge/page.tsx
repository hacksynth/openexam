import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { listKnowledgeHierarchy } from "@openexam/core/exam-core";
import { buildKnowledgeTree, flattenKnowledgeTree, type KnowledgeTreeItem } from "@openexam/core/knowledge";
import { FeedbackMessage, SelectField, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import {
  createKnowledgeNodeAction,
  createSyllabusAction,
  updateKnowledgeNodeAction,
  updateSyllabusAction
} from "./actions";

type KnowledgePageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

type KnowledgeSubject = Awaited<ReturnType<typeof listKnowledgeHierarchy>>[number];
type KnowledgeSyllabus = KnowledgeSubject["syllabi"][number] & { subject: KnowledgeSubject };
type AdminKnowledgeNode = KnowledgeSyllabus["knowledgeNodes"][number];
type AdminKnowledgeTreeItem = KnowledgeTreeItem<AdminKnowledgeNode>;

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
        <FeedbackMessage error={params.error} notice={params.notice} />

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

        {syllabi.map((syllabus) => (
          <KnowledgeSyllabusSection key={syllabus.id} syllabus={syllabus} />
        ))}
      </section>
    </AppShell>
  );
}

function KnowledgeSyllabusSection({ syllabus }: { syllabus: KnowledgeSyllabus }) {
  const tree = buildKnowledgeTree(syllabus.knowledgeNodes);
  const flatNodes = flattenKnowledgeTree(tree);
  const nodeById = new Map(flatNodes.map((node) => [node.id, node]));

  return (
    <section className="pixel-panel grid gap-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase text-[var(--muted)]">
          {syllabus.subject.cycle.track.program.name} / {syllabus.subject.cycle.track.name} / {syllabus.subject.name}
        </p>
        <h2 className="mt-1 text-xl font-black">
          {syllabus.name} ({syllabus.version})
        </h2>
      </div>

      <form action={createKnowledgeNodeAction} className="grid gap-3 border-2 border-black bg-white p-3 lg:grid-cols-[1.2fr_0.8fr_1fr_auto]">
        <input name="syllabusId" type="hidden" value={syllabus.id} />
        <SelectField label="父级" name="parentId">
          {renderParentOptions(flatNodes)}
        </SelectField>
        <TextField label="编码" name="code" placeholder="DS-ALGO-001" />
        <TextField label="标题" name="title" placeholder="算法复杂度" required />
        <SubmitButton label="新增知识点" />
        <TextareaField label="描述" labelClassName="lg:col-span-2" name="description" placeholder="知识点说明" rows={3} />
        <TextareaField label="考试要求" labelClassName="lg:col-span-2" name="examExpectation" placeholder="考试中常见考查方式" rows={3} />
      </form>

      {flatNodes.length === 0 ? (
        <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">暂无知识点。</p>
      ) : (
        <div className="grid gap-3">
          {flatNodes.map((node) => (
            <KnowledgeNodeForm key={node.id} node={node} nodeById={nodeById} nodes={flatNodes} />
          ))}
        </div>
      )}
    </section>
  );
}

function KnowledgeNodeForm({
  node,
  nodeById,
  nodes
}: {
  node: AdminKnowledgeTreeItem;
  nodeById: Map<string, AdminKnowledgeTreeItem>;
  nodes: AdminKnowledgeTreeItem[];
}) {
  const invalidParentIds = new Set(flattenKnowledgeTree([node]).map((item) => item.id));
  const parentName = node.parentId ? parentTitle(nodeById, node.parentId) : "顶层知识点";

  return (
    <form
      action={updateKnowledgeNodeAction}
      className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1fr_1fr_0.8fr_1fr_auto]"
      style={{ marginLeft: `${Math.min(node.depth, 6) * 0.75}rem` }}
    >
      <input name="id" type="hidden" value={node.id} />
      <SelectField label="父级" name="parentId" defaultValue={node.parentId ?? ""}>
        {renderParentOptions(nodes, invalidParentIds)}
      </SelectField>
      <p className="self-end truncate pb-2 text-sm font-bold text-[var(--muted)]" title={parentName}>
        {parentName}
      </p>
      <TextField label="编码" name="code" defaultValue={node.code ?? ""} />
      <TextField label="标题" name="title" defaultValue={node.title} required />
      <SubmitButton label="保存" />
      <TextareaField defaultValue={node.description ?? ""} label="描述" labelClassName="lg:col-span-2" name="description" rows={3} />
      <TextareaField defaultValue={node.examExpectation ?? ""} label="考试要求" labelClassName="lg:col-span-3" name="examExpectation" rows={3} />
    </form>
  );
}

function renderParentOptions(nodes: AdminKnowledgeTreeItem[], excludeIds = new Set<string>()) {
  return [
    <option key="root" value="">
      顶层知识点
    </option>,
    ...nodes
      .filter((node) => !excludeIds.has(node.id))
      .map((node) => (
        <option key={node.id} value={node.id}>
          {optionLabel(node)}
        </option>
      ))
  ];
}

function parentTitle(nodeById: Map<string, AdminKnowledgeTreeItem>, parentId: string) {
  const parent = nodeById.get(parentId);

  return parent ? `${parent.code ? `${parent.code} ` : ""}${parent.title}` : "未知父级";
}

function optionLabel(node: AdminKnowledgeTreeItem) {
  return `${"  ".repeat(node.depth)}${node.code ? `${node.code} ` : ""}${node.title}`;
}
