import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "@/components/app-shell";
import { PaginationHeader, PaginationNav } from "@/components/pagination";
import { requireWebSession } from "@/lib/auth";
import { listWrongNotes } from "@openexam/core/practice";
import { FeedbackMessage, SelectField, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import { listWrongNoteReviewCardViews } from "@openexam/core/wrong-note-images";
import { generateWrongNoteAiAnalysisAction, queueWrongNoteReviewCardAction, setWrongNoteMasteredAction, updateWrongNoteReflectionAction } from "./actions";
import { normalizeWrongNoteFilter, wrongNoteFilterOptions, wrongNoteHref } from "./filters";
import { AiAnalysisSubmitButton, ReviewCardSubmitButton } from "./submit-button";

type WrongNotesPageProps = {
  searchParams: Promise<{ error?: string; notice?: string; filter?: string; knowledgeNodeId?: string; minErrorCount?: string; page?: string; pageSize?: string; questionKind?: string }>;
};

type WrongNoteListItem = Awaited<ReturnType<typeof listWrongNotes>>["items"][number];
type ReviewCardMap = Awaited<ReturnType<typeof listWrongNoteReviewCardViews>>;
type ReviewCardView = ReviewCardMap extends Map<string, infer View> ? View : never;

export default async function WrongNotesPage({ searchParams }: WrongNotesPageProps) {
  const session = await requireWebSession();
  const params = await searchParams;
  const filter = normalizeWrongNoteFilter(params.filter);
  const knowledgeNodeId = params.knowledgeNodeId?.trim() || "";
  const minErrorCount = params.minErrorCount?.trim() || "";
  const questionKind = params.questionKind?.trim() || "";
  const currentHref = wrongNoteHref({
    filter,
    knowledgeNodeId,
    minErrorCount,
    page: params.page,
    pageSize: params.pageSize,
    questionKind
  });
  const state = await listWrongNotes(session.user.id, {
    mastered: filter === "pending" ? false : filter === "mastered" ? true : undefined,
    knowledgeNodeId,
    minErrorCount,
    page: params.page,
    pageSize: params.pageSize,
    questionKind
  });
  const reviewCards = await listWrongNoteReviewCardViews(
    session.user.id,
    state.items.map((note) => note.id)
  );

  return (
    <AppShell section="learner" eyebrow="练习闭环" title="错题本">
      <section className="grid gap-5">
        <FeedbackMessage error={params.error} notice={params.notice} />

        <section className="pixel-panel grid gap-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--muted)]">错题本</p>
            <h2 className="mt-2 text-2xl font-black">待复习 {state.pendingCount} 题</h2>
            <p className="mt-1 font-bold text-[var(--muted)]">练习中答错的题会自动进入错题本，可手动切换掌握状态。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={"/practice" as Route} className="pixel-button px-4 py-2">
              开始练习
            </Link>
            <Link href={"/attempts" as Route} className="pixel-button bg-white px-4 py-2">
              作答记录
            </Link>
            <Link href={"/dashboard" as Route} className="pixel-button bg-white px-4 py-2">
              返回仪表盘
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 border-2 border-black bg-[var(--surface-subtle)] p-2" aria-label="错题状态筛选">
            {wrongNoteFilterOptions.map((option) => (
              <Link
                key={option.value}
                href={wrongNoteHref({ filter: option.value, knowledgeNodeId, minErrorCount, page: 1, pageSize: params.pageSize, questionKind }) as Route}
                className={`border-2 border-black px-4 py-2 text-sm font-black ${filter === option.value ? "bg-[var(--primary)]" : "bg-white hover:bg-[var(--primary)]"}`}
              >
                {option.label}
              </Link>
            ))}
          </div>
          {state.summary.weakKnowledgeNodes.length > 0 ? (
            <div className="grid gap-3 border-2 border-black bg-white p-3">
              <p className="text-sm font-bold text-[var(--muted)]">薄弱知识点</p>
              <div className="flex flex-wrap gap-2">
                {state.summary.weakKnowledgeNodes.map((node) => (
                  <span key={node.title} className="status-chip px-2 py-1">
                    {node.title} · {node.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {state.knowledgeOptions.length > 0 ? (
            <div className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
              <p className="text-sm font-bold text-[var(--muted)]">按知识点筛选</p>
              <div className="flex flex-wrap gap-2">
                <Link href={wrongNoteHref({ filter, knowledgeNodeId: "", minErrorCount, page: 1, pageSize: params.pageSize, questionKind }) as Route} className={knowledgeFilterClass(!knowledgeNodeId)}>
                  全部知识点
                </Link>
                {state.knowledgeOptions.map((node) => (
                  <Link
                    key={node.id}
                    href={wrongNoteHref({ filter, knowledgeNodeId: node.id, minErrorCount, page: 1, pageSize: params.pageSize, questionKind }) as Route}
                    className={knowledgeFilterClass(knowledgeNodeId === node.id)}
                  >
                    {node.title} · {node.count}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input name="filter" type="hidden" value={filter} />
            <input name="knowledgeNodeId" type="hidden" value={knowledgeNodeId} />
            <input name="page" type="hidden" value="1" />
            {params.pageSize ? <input name="pageSize" type="hidden" value={params.pageSize} /> : null}
            <TextField defaultValue={minErrorCount} label="最少错误次数" name="minErrorCount" placeholder="例如 2" />
            <SelectField defaultValue={questionKind} label="题型" name="questionKind">
              <option value="">全部</option>
              <option value="single_choice">单选</option>
              <option value="multiple_choice">多选</option>
              <option value="true_false">判断</option>
              <option value="blank">填空</option>
              <option value="short_answer">简答</option>
              <option value="case_analysis">案例</option>
            </SelectField>
            <SubmitButton className="px-4 py-2" label="筛选" />
          </form>
        </section>

        <PaginationHeader basePath="/wrong-notes" itemLabel="题" pagination={state.pagination} params={params} />

        {state.items.length === 0 ? (
          <section className="pixel-panel grid gap-4 p-5">
            <div>
              <h2 className="text-2xl font-black">暂无错题</h2>
              <p className="mt-1 font-bold text-[var(--muted)]">{filter === "all" ? "提交错误答案后，这里会显示题目、正确答案、解析和关联知识点。" : "当前筛选条件下暂无错题。"}</p>
            </div>
            <Link href={"/practice" as Route} className="pixel-button w-fit px-4 py-2">
              去练习
            </Link>
          </section>
        ) : (
          <section className="grid gap-4">
            {state.items.map((note) => (
              <WrongNoteCard key={note.id} currentHref={currentHref} note={note} reviewCard={reviewCards.get(note.id) ?? null} />
            ))}
          </section>
        )}
        <PaginationNav basePath="/wrong-notes" pagination={state.pagination} params={params} />
      </section>
    </AppShell>
  );
}

function WrongNoteCard({
  note,
  currentHref,
  reviewCard
}: {
  note: WrongNoteListItem;
  currentHref: string;
  reviewCard: ReviewCardView | null;
}) {
  const busy = reviewCard?.latestJob?.status === "queued" || reviewCard?.latestJob?.status === "running";

  return (
    <article className="pixel-panel grid gap-4 p-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className={`status-chip px-2 py-1 ${note.mastered ? "bg-[var(--teal)]" : "bg-[var(--danger)] text-white"}`}>
              {note.mastered ? "已掌握" : "未掌握"}
            </span>
            <span className="status-chip px-2 py-1">错误 {note.errorCount} 次</span>
            <span className="status-chip px-2 py-1">更新 {formatDate(note.updatedAt)}</span>
          </div>
          <h2 className="break-words text-xl font-black leading-8">{note.stem}</h2>
        </div>
        <form action={setWrongNoteMasteredAction} className="self-start">
          <input name="wrongNoteId" type="hidden" value={note.id} />
          <input name="mastered" type="hidden" value={note.mastered ? "false" : "true"} />
          <input name="returnTo" type="hidden" value={currentHref} />
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <Link href={`/practice?retry=${note.questionId}` as Route} className="pixel-button whitespace-nowrap bg-white px-4 py-2">
              重练此题
            </Link>
            <SubmitButton className="whitespace-nowrap px-4 py-2" label={note.mastered ? "标记未掌握" : "标记已掌握"} />
          </div>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {note.knowledgeNodes.map((node) => (
          <span key={node.id} className="status-chip px-2 py-1">
            {node.title}
          </span>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <div className="border-2 border-black bg-[var(--surface-subtle)] p-3">
          <p className="text-sm font-bold text-[var(--muted)]">正确答案</p>
          <p className="mt-1 text-2xl font-black">{note.correctAnswer ?? "未配置"}</p>
        </div>
        {note.explanation ? (
          <div className="border-2 border-black bg-white p-3">
            <p className="text-sm font-bold text-[var(--muted)]">解析</p>
            <p className="mt-1 leading-7">{note.explanation}</p>
          </div>
        ) : null}
      </div>

      {note.aiAnalysis ? (
        <div className="border-2 border-black bg-[var(--ai-soft)] p-3">
          <p className="text-sm font-bold text-[var(--muted)]">AI 解析</p>
          <p className="mt-1 whitespace-pre-line leading-7">{note.aiAnalysis}</p>
        </div>
      ) : null}

      <form action={updateWrongNoteReflectionAction} className="grid gap-3 border-2 border-black bg-white p-3">
        <input name="wrongNoteId" type="hidden" value={note.id} />
        <input name="returnTo" type="hidden" value={currentHref} />
        <TextField defaultValue={note.mistakeTags.join("，")} inputClassName="border-2" label="错因标签" name="mistakeTags" placeholder="概念混淆，审题失误" />
        <TextareaField defaultValue={note.userNotes ?? ""} label="我的笔记" name="userNotes" rows={3} textareaClassName="border-2" />
        <SubmitButton className="w-fit bg-white px-4 py-2" label="保存标签笔记" />
      </form>

      <div className="grid gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--muted)]">复习卡图片</p>
            {reviewCard?.latestJob ? (
              <p className="mt-1 text-sm font-bold">
                任务 {reviewCardStatusLabel(reviewCard.latestJob.status)} · 更新 {formatDateTime(reviewCard.latestJob.updatedAt)}
              </p>
            ) : null}
          </div>
          {reviewCard?.latestJob ? (
            <span className={`status-chip px-2 py-1 ${reviewCard.latestJob.status === "failed" ? "bg-[var(--danger)] text-white" : reviewCard.latestJob.status === "succeeded" ? "bg-[var(--teal)]" : ""}`}>
              {reviewCardStatusLabel(reviewCard.latestJob.status)}
            </span>
          ) : null}
        </div>
        {reviewCard?.latestJob?.error ? <p className="border-2 border-black bg-red-50 p-3 text-sm font-bold text-red-700">{reviewCard.latestJob.error}</p> : null}
        {reviewCard?.asset ? (
          <img
            alt="错题复习卡"
            className="w-full max-w-[520px] border-3 border-black bg-white object-contain"
            src={`/assets/${reviewCard.asset.id}`}
          />
        ) : null}
        <form action={queueWrongNoteReviewCardAction}>
          <input name="wrongNoteId" type="hidden" value={note.id} />
          <input name="returnTo" type="hidden" value={currentHref} />
          <ReviewCardSubmitButton busy={busy} hasCard={Boolean(reviewCard?.asset)} />
        </form>
      </div>

      <form action={generateWrongNoteAiAnalysisAction}>
        <input name="wrongNoteId" type="hidden" value={note.id} />
        <input name="returnTo" type="hidden" value={currentHref} />
        <AiAnalysisSubmitButton hasAnalysis={Boolean(note.aiAnalysis)} />
      </form>
    </article>
  );
}

function knowledgeFilterClass(active: boolean) {
  return `border-2 border-black px-3 py-2 text-sm font-black ${active ? "bg-[var(--primary)]" : "bg-white hover:bg-[var(--primary)]"}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(value)
    .replaceAll("/", "-");
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
    .format(value)
    .replaceAll("/", "-");
}

function reviewCardStatusLabel(value: string) {
  return { queued: "排队中", running: "运行中", succeeded: "成功", failed: "失败", canceled: "已取消" }[value] ?? value;
}
