import Link from "next/link";
import type { Route } from "next";
import { homepageStatusLabels, listHomepageExamPrograms, type HomepageExamProgram } from "@openexam/core/exam-core";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const programs = await listHomepageExamPrograms();
  const primaryProgram = programs[0];

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl content-center gap-6 px-4 py-8">
      <section className="pixel-panel grid gap-6 p-6 md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="mb-3 text-sm font-bold uppercase text-[var(--muted)]">自托管 AI 备考平台</p>
            <h1 className="text-4xl font-black md:text-6xl">OpenExam</h1>
            <p className="mt-4 max-w-3xl text-lg font-bold leading-8 text-[var(--muted)]">
              按考试大方向进入，再选择方向或科目，最后设置个人目标。
            </p>
          </div>
          <div className="border-3 border-black bg-[var(--surface-subtle)] p-4">
            <p className="text-xs font-bold uppercase text-[var(--muted)]">当前可用考试</p>
            <p className="mt-2 break-words text-2xl font-black">{primaryProgram ? primaryProgram.name : "暂无开放考试"}</p>
          </div>
        </div>
      </section>

      {programs.length === 0 ? (
        <section className="pixel-panel p-5">
          <p className="text-xs font-bold uppercase text-[var(--muted)]">Exams</p>
          <h2 className="mt-2 text-2xl font-black">暂无开放考试</h2>
          <p className="mt-2 font-bold leading-7 text-[var(--muted)]">
            管理员配置开放或规划中的方向/科目后，这里会显示考试大方向。
          </p>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </section>
      )}
    </main>
  );
}

function ProgramCard({ program }: { program: HomepageExamProgram }) {
  return (
    <article className="pixel-panel grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-[var(--muted)]">考试大方向</p>
          <h2 className="mt-2 break-words text-2xl font-black">{program.name}</h2>
        </div>
        <span className="status-chip px-2 py-1">{homepageStatusLabels[program.status]}</span>
      </div>

      <p className="font-bold leading-7 text-[var(--muted)]">
        开放 {program.openCount} 个{program.itemLabel} / 规划中 {program.plannedCount} 个{program.itemLabel}
      </p>

      {program.openItemNames.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="status-chip bg-white px-2 py-1">当前开放</span>
          {program.openItemNames.map((name) => (
            <span key={name} className="status-chip px-2 py-1">
              {name}
            </span>
          ))}
        </div>
      ) : null}

      <Link href={`/exams/${program.slug}` as Route} className="pixel-button w-fit px-4 py-2">
        查看{program.itemLabel}
      </Link>
    </article>
  );
}
