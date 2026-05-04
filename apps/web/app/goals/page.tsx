import Link from "next/link";
import { PixelSelect } from "@openexam/core/pixel-select";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { requireWebSession } from "@/lib/auth";
import { formatDateInput, formatGoalPath, getPrimaryExamGoal, listExamHierarchy } from "@openexam/core/exam-core";
import { savePrimaryGoalAction } from "./actions";

type GoalsPageProps = {
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const inputClass = "min-w-0 border-3 border-black bg-white px-3 py-2 text-sm font-bold";
const labelClass = "grid gap-2 text-sm font-bold";

export default async function GoalsPage({ searchParams }: GoalsPageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const [hierarchy, primaryGoal] = await Promise.all([listExamHierarchy(), getPrimaryExamGoal(session.user.id)]);
  const tracks = hierarchy.flatMap((program) => program.tracks.map((track) => ({ ...track, program })));
  const cycles = tracks.flatMap((track) => track.cycles.map((cycle) => ({ ...cycle, track })));
  const subjects = cycles.flatMap((cycle) => cycle.subjects.map((subject) => ({ ...subject, cycle })));

  return (
    <AppShell section="learner" eyebrow="Exam Core" title="考试目标">
      <section className="grid gap-5">
        <Feedback error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">当前主目标</p>
            {primaryGoal ? (
              <>
                <h2 className="mt-2 text-2xl font-black">{formatGoalPath(primaryGoal)}</h2>
                <p className="mt-1 font-bold text-[var(--muted)]">
                  目标日期 {formatDateInput(primaryGoal.targetDate) || "未设置"} / 目标分 {primaryGoal.targetScore ?? "未设置"} / 每日 {primaryGoal.dailyMinutes} 分钟
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-2 text-2xl font-black">尚未选择考试目标</h2>
                <p className="mt-1 font-bold text-[var(--muted)]">保存主目标后，仪表盘会显示真实考试目标。</p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={"/dashboard" as Route} className="pixel-button bg-white px-4 py-2">
              返回仪表盘
            </Link>
          </div>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Primary Goal</p>
            <h2 className="mt-1 text-xl font-black">设置主目标</h2>
          </div>
          <form action={savePrimaryGoalAction} className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <SelectField label="考试项目" name="programId" defaultValue={primaryGoal?.programId ?? ""} required>
                <option value="">选择考试项目</option>
                {hierarchy.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="考试方向" name="trackId" defaultValue={primaryGoal?.trackId ?? ""}>
                <option value="">暂不选择方向</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.program.name} / {track.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="考试批次" name="cycleId" defaultValue={primaryGoal?.cycleId ?? ""}>
                <option value="">暂不选择批次</option>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.track.program.name} / {cycle.track.name} / {cycle.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label="科目范围" name="subjectId" defaultValue={primaryGoal?.subjectId ?? ""}>
                <option value="">全科目</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.cycle.track.name} / {subject.cycle.name} / {subject.name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
              <label className={labelClass}>
                目标日期
                <input className={inputClass} defaultValue={formatDateInput(primaryGoal?.targetDate)} name="targetDate" type="date" />
              </label>
              <label className={labelClass}>
                目标分
                <input className={inputClass} defaultValue={primaryGoal?.targetScore ?? ""} min="0" name="targetScore" placeholder="60" step="0.5" type="number" />
              </label>
              <label className={labelClass}>
                每日学习分钟
                <input className={inputClass} defaultValue={primaryGoal?.dailyMinutes ?? 60} max="600" min="1" name="dailyMinutes" type="number" />
              </label>
              <button className="pixel-button self-end px-4 py-2" type="submit">
                保存主目标
              </button>
            </div>
          </form>
        </section>

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Available Scope</p>
            <h2 className="mt-1 text-xl font-black">可选考试范围</h2>
          </div>
          {hierarchy.length === 0 ? (
            <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">暂无考试数据，请管理员先在管理端创建。</p>
          ) : (
            <div className="grid gap-3">
              {hierarchy.map((program) => (
                <div key={program.id} className="border-2 border-black bg-[var(--surface-subtle)] p-3">
                  <h3 className="text-lg font-black">{program.name}</h3>
                  <div className="mt-3 grid gap-2">
                    {program.tracks.map((track) => (
                      <div key={track.id} className="border-2 border-black bg-white p-3">
                        <p className="font-black">
                          {track.name}
                          {track.level ? <span className="ml-2 text-sm text-[var(--muted)]">{track.level}</span> : null}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {track.cycles.flatMap((cycle) =>
                            cycle.subjects.length > 0
                              ? cycle.subjects.map((subject) => (
                                  <span key={subject.id} className="status-chip px-2 py-1">
                                    {cycle.name} / {subject.name}
                                  </span>
                                ))
                              : [
                                  <span key={cycle.id} className="status-chip px-2 py-1">
                                    {cycle.name}
                                  </span>
                                ]
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </AppShell>
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
