import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/lib/auth";
import { formatDateInput, listExamHierarchy } from "@openexam/core/exam-core";
import { DateField, FeedbackMessage, SelectField, SubmitButton, TextField } from "@openexam/core/pixel-ui";
import {
  createCycleAction,
  createProgramAction,
  createSubjectAction,
  createTrackAction,
  updateCycleAction,
  updateProgramAction,
  updateSubjectAction,
  updateTrackAction
} from "./actions";

type ExamsPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function AdminExamsPage({ searchParams }: ExamsPageProps) {
  await requireAdminSession();
  const params = await searchParams;
  const hierarchy = await listExamHierarchy();
  const tracks = hierarchy.flatMap((program) => program.tracks.map((track) => ({ ...track, program })));
  const cycles = tracks.flatMap((track) => track.cycles.map((cycle) => ({ ...cycle, track })));

  return (
    <AppShell section="admin" eyebrow="Exam Core" title="考试">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Program</p>
            <h2 className="mt-1 text-xl font-black">考试项目</h2>
          </div>
          <form action={createProgramAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr_auto]">
            <TextField label="名称" name="name" placeholder="软考" required />
            <TextField label="Slug" name="slug" placeholder="ruankao" required />
            <TextField label="说明" name="description" placeholder="中国计算机技术与软件专业技术资格" />
            <SubmitButton label="新增项目" />
          </form>
          <div className="grid gap-3">
            {hierarchy.map((program) => (
              <form key={program.id} action={updateProgramAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1fr_1fr_1.5fr_auto]">
                <input name="id" type="hidden" value={program.id} />
                <TextField label="名称" name="name" defaultValue={program.name} required />
                <TextField label="Slug" name="slug" defaultValue={program.slug} required />
                <TextField label="说明" name="description" defaultValue={program.description ?? ""} />
                <SubmitButton label="保存" />
              </form>
            ))}
          </div>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Track</p>
            <h2 className="mt-1 text-xl font-black">考试方向</h2>
          </div>
          <form action={createTrackAction} className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
            <SelectField label="所属项目" name="programId" required>
              <option value="">选择考试项目</option>
              {hierarchy.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </SelectField>
            <TextField label="名称" name="name" placeholder="软件设计师" required />
            <TextField label="Slug" name="slug" placeholder="software-designer" required />
            <TextField label="级别" name="level" placeholder="中级" />
            <SubmitButton label="新增方向" />
          </form>
          <div className="grid gap-3">
            {tracks.map((track) => (
              <form key={track.id} action={updateTrackAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                <input name="id" type="hidden" value={track.id} />
                <p className="self-end truncate pb-2 text-sm font-bold text-[var(--muted)]" title={track.program.name}>
                  {track.program.name}
                </p>
                <TextField label="名称" name="name" defaultValue={track.name} required />
                <TextField label="Slug" name="slug" defaultValue={track.slug} required />
                <TextField label="级别" name="level" defaultValue={track.level ?? ""} />
                <SubmitButton label="保存" />
              </form>
            ))}
          </div>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Cycle</p>
            <h2 className="mt-1 text-xl font-black">考试批次</h2>
          </div>
          <form action={createCycleAction} className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto]">
            <SelectField label="所属方向" name="trackId" required>
              <option value="">选择考试方向</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.program.name} / {track.name}
                </option>
              ))}
            </SelectField>
            <TextField label="名称" name="name" placeholder="2026 上半年" required />
            <TextField label="Slug" name="slug" placeholder="2026-h1" required />
            <DateField label="开始日期" name="startsAt" />
            <DateField label="考试日期" name="examDate" />
            <SubmitButton label="新增批次" />
          </form>
          <div className="grid gap-3">
            {cycles.map((cycle) => (
              <form key={cycle.id} action={updateCycleAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto]">
                <input name="id" type="hidden" value={cycle.id} />
                <p className="self-end truncate pb-2 text-sm font-bold text-[var(--muted)]" title={`${cycle.track.program.name} / ${cycle.track.name}`}>
                  {cycle.track.program.name} / {cycle.track.name}
                </p>
                <TextField label="名称" name="name" defaultValue={cycle.name} required />
                <TextField label="Slug" name="slug" defaultValue={cycle.slug} required />
                <DateField label="开始日期" name="startsAt" defaultValue={formatDateInput(cycle.startsAt)} />
                <DateField label="考试日期" name="examDate" defaultValue={formatDateInput(cycle.examDate)} />
                <SubmitButton label="保存" />
              </form>
            ))}
          </div>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Subject</p>
            <h2 className="mt-1 text-xl font-black">科目</h2>
          </div>
          <form action={createSubjectAction} className="grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_1.5fr_auto]">
            <SelectField label="所属批次" name="cycleId" required>
              <option value="">选择考试批次</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.track.program.name} / {cycle.track.name} / {cycle.name}
                </option>
              ))}
            </SelectField>
            <TextField label="名称" name="name" placeholder="基础知识" required />
            <TextField label="Slug" name="slug" placeholder="basic-knowledge" required />
            <TextField label="说明" name="description" placeholder="上午客观题科目" />
            <SubmitButton label="新增科目" />
          </form>
          <div className="grid gap-3">
            {cycles.flatMap((cycle) =>
              cycle.subjects.map((subject) => (
                <form key={subject.id} action={updateSubjectAction} className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 lg:grid-cols-[1.3fr_1fr_1fr_1.5fr_auto]">
                  <input name="id" type="hidden" value={subject.id} />
                  <p className="self-end truncate pb-2 text-sm font-bold text-[var(--muted)]" title={`${cycle.track.program.name} / ${cycle.track.name} / ${cycle.name}`}>
                    {cycle.track.name} / {cycle.name}
                  </p>
                  <TextField label="名称" name="name" defaultValue={subject.name} required />
                  <TextField label="Slug" name="slug" defaultValue={subject.slug} required />
                  <TextField label="说明" name="description" defaultValue={subject.description ?? ""} />
                  <SubmitButton label="保存" />
                </form>
              ))
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
