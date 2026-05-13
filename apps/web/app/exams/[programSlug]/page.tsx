import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";
import {
  getHomepageExamProgramDetail,
  homepageStatusLabels,
  type HomepageExamItem
} from "@openexam/core/exam-core";
import { getWebSession } from "@/lib/auth";
import { withDefaultLocalePath } from "@/lib/locale";

export const dynamic = "force-dynamic";

type ProgramPageProps = {
  params: Promise<{ programSlug: string }>;
};

export default async function ExamProgramPage({ params }: ProgramPageProps) {
  const { programSlug } = await params;
  const [session, program] = await Promise.all([getWebSession(), getHomepageExamProgramDetail(programSlug)]);

  if (!program) {
    notFound();
  }

  const openItems = program.items.filter((item) => item.status === "open");
  const plannedItems = program.items.filter((item) => item.status === "planned");

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl content-start gap-6 px-4 py-8">
      <section className="pixel-panel grid gap-4 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase text-[var(--muted)]">考试大方向</p>
            <h1 className="mt-2 break-words text-4xl font-black md:text-6xl">{program.name}</h1>
          </div>
          <span className="status-chip px-2 py-1">{homepageStatusLabels[program.status]}</span>
        </div>
        <p className="max-w-3xl font-bold leading-7 text-[var(--muted)]">
          {program.description || `选择一个${program.itemLabel}后进入个人考试目标设置。`}
        </p>
        {program.selectionLevel === "subject" && program.defaultTrackName && program.defaultCycleName ? (
          <p className="border-2 border-black bg-[var(--surface-subtle)] p-3 text-sm font-bold text-[var(--muted)]">
            当前展示 {program.defaultTrackName} / {program.defaultCycleName} 下的科目。
          </p>
        ) : null}
        <Link href={withDefaultLocalePath("/") as Route} className="pixel-button w-fit bg-white px-4 py-2">
          返回考试大方向
        </Link>
      </section>

      {openItems.length > 0 ? (
        <section className="grid gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Open</p>
            <h2 className="mt-1 text-2xl font-black">当前开放</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {openItems.map((item) => (
              <ExamItemCard key={item.id} item={item} sessionReady={Boolean(session)} />
            ))}
          </div>
        </section>
      ) : null}

      {plannedItems.length > 0 ? (
        <section className="grid gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">Planned</p>
            <h2 className="mt-1 text-2xl font-black">规划中</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {plannedItems.map((item) => (
              <ExamItemCard key={item.id} item={item} sessionReady={Boolean(session)} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ExamItemCard({ item, sessionReady }: { item: HomepageExamItem; sessionReady: boolean }) {
  const href = buildItemHref(item, sessionReady);

  return (
    <article className="pixel-panel grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-[var(--muted)]">{item.kind === "subject" ? "科目" : "考试方向"}</p>
          <h3 className="mt-2 break-words text-2xl font-black">{item.name}</h3>
        </div>
        <span className="status-chip px-2 py-1">{homepageStatusLabels[item.status]}</span>
      </div>

      {item.description ? (
        <p className="font-bold leading-7 text-[var(--muted)]">{item.description}</p>
      ) : (
        <p className="font-bold leading-7 text-[var(--muted)]">{item.kind === "subject" ? "当前可选择的考试科目。" : "当前可选择的考试方向。"}</p>
      )}

      <ItemSummary item={item} />

      {item.status === "open" && href ? (
        <Link href={href as Route} className="pixel-button w-fit px-4 py-2">
          {sessionReady ? `选择此${item.kind === "subject" ? "科目" : "方向"}` : "登录后选择"}
        </Link>
      ) : (
        <span className="status-chip w-fit px-2 py-1">规划中</span>
      )}
    </article>
  );
}

function ItemSummary({ item }: { item: HomepageExamItem }) {
  if (item.kind === "subject") {
    return (
      <div className="flex flex-wrap gap-2">
        <span className="status-chip bg-white px-2 py-1">{item.trackName}</span>
        <span className="status-chip bg-white px-2 py-1">{item.cycleName}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {item.cycles.slice(0, 3).map((cycle) => (
        <span key={cycle.id} className="status-chip px-2 py-1">
          {cycle.name}
        </span>
      ))}
      {subjectNames(item).slice(0, 4).map((subject) => (
        <span key={subject} className="status-chip bg-white px-2 py-1">
          {subject}
        </span>
      ))}
    </div>
  );
}

function buildItemHref(item: HomepageExamItem, sessionReady: boolean) {
  if (item.status !== "open") {
    return null;
  }

  const goalsHref =
    item.kind === "subject"
      ? `/goals?programId=${encodeURIComponent(item.programId)}&trackId=${encodeURIComponent(item.trackId)}&cycleId=${encodeURIComponent(item.cycleId)}&subjectId=${encodeURIComponent(item.id)}`
      : `/goals?programId=${encodeURIComponent(item.programId)}&trackId=${encodeURIComponent(item.trackId)}`;

  return sessionReady ? withDefaultLocalePath(goalsHref) : withDefaultLocalePath(`/login?redirectTo=${encodeURIComponent(goalsHref)}`);
}

function subjectNames(item: Extract<HomepageExamItem, { kind: "track" }>) {
  return Array.from(new Set(item.cycles.flatMap((cycle) => cycle.subjects.map((subject) => subject.name))));
}
