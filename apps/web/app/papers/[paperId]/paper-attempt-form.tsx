"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { RichContent } from "@/components/rich-content";
import type { PaperAttemptSessionState } from "@openexam/core/papers";
import { PixelChoice, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import { autosavePaperAttemptAction, pausePaperAttemptAction, resumePaperAttemptAction, submitPaperAttemptAction } from "../actions";

type ReadyState = Extract<PaperAttemptSessionState, { status: "ready" }>;
type ReadyPaper = ReadyState["paper"];
type ReadyAttempt = ReadyState["attempt"];
type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function PaperAttemptForm({ paper, attempt }: { paper: ReadyPaper; attempt: ReadyAttempt }) {
  const [answers, setAnswers] = useState<Record<string, string>>(attempt.answers);
  const [elapsedSeconds, setElapsedSeconds] = useState(attempt.elapsedSeconds);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const paused = attempt.status === "paused";
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const unansweredCount = paper.questions.length - answeredCount;
  const questionStatus = useMemo(
    () =>
      paper.questions.map((question) => ({
        id: question.id,
        number: question.number,
        answered: Boolean(answers[question.id])
      })),
    [answers, paper.questions]
  );

  useEffect(() => {
    if (paused) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (paused) {
      return;
    }

    const entries = Object.entries(answers);

    if (entries.length === 0) {
      return;
    }

    let canceled = false;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      void Promise.all(
        entries.map(([questionId, answer]) =>
          autosavePaperAttemptAction({
          attemptId: attempt.id,
          questionId,
          answer
          })
        )
      ).then((results) => {
        if (!canceled) {
          setSaveStatus(results.every((result) => result.ok) ? "saved" : "failed");
        }
      });
    }, 500);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [answers, attempt.id, paused]);

  return (
    <form
      action={submitPaperAttemptAction}
      className="grid gap-4"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;

        if (submitter?.dataset.action === "submit" && unansweredCount > 0 && !window.confirm(`还有 ${unansweredCount} 道题未作答，未答题将按 0 分处理。确认提交？`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="paperId" type="hidden" value={paper.id} />
      <input name="attemptId" type="hidden" value={attempt.id} />
      <section className="pixel-panel sticky top-3 z-10 grid gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="status-chip px-2 py-1">已答 {answeredCount} / {paper.questions.length}</span>
            <span className="status-chip px-2 py-1">未答 {unansweredCount}</span>
            <span className="status-chip px-2 py-1">{paused ? "已暂停" : `用时 ${formatDuration(elapsedSeconds)}`}</span>
            <span className={`status-chip px-2 py-1 ${saveStatus === "failed" ? "bg-[var(--danger)] text-white" : saveStatus === "saved" ? "bg-[var(--teal)]" : ""}`}>
              {paused ? "暂停中" : saveStatusLabel(saveStatus)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {paused ? (
              <SubmitButton className="bg-white px-4 py-2" formAction={resumePaperAttemptAction} label="恢复" />
            ) : (
              <SubmitButton className="bg-white px-4 py-2" formAction={pausePaperAttemptAction} label="暂停" />
            )}
            <SubmitButton className="px-4 py-2" data-action="submit" disabled={paused} label="提交试卷" />
          </div>
        </div>
        <nav aria-label="答题卡" className="flex flex-wrap gap-2">
          {questionStatus.map((question) => (
            <a
              key={question.id}
              href={`#question-${question.id}`}
              className={`border-2 border-black px-3 py-2 text-sm font-black ${question.answered ? "bg-[var(--teal)]" : "bg-white"}`}
            >
              {question.number}
            </a>
          ))}
        </nav>
      </section>

      {paper.questions.map((question) => (
        <section id={`question-${question.id}`} key={question.id} className="pixel-panel scroll-mt-32 grid gap-4 p-5">
          <input name="questionId" type="hidden" value={question.id} />
          <input name={`answer_${question.id}`} type="hidden" value={answers[question.id] ?? ""} />
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="status-chip px-2 py-1">第 {question.number} 题</span>
              <span className="status-chip px-2 py-1">{question.score} 分</span>
              {question.section ? <span className="status-chip px-2 py-1">{question.section}</span> : null}
              {question.knowledgeNodes.map((node) => (
                <span key={node} className="status-chip px-2 py-1">
                  {node}
                </span>
              ))}
            </div>
            {question.caseMaterial ? (
              <div className="border-2 border-black bg-[var(--surface-subtle)] p-3">
                <p className="text-sm font-bold text-[var(--muted)]">案例材料</p>
                <p className="mt-1 whitespace-pre-line font-bold leading-7">{question.caseMaterial}</p>
              </div>
            ) : null}
            <RichContent blocks={question.stemBlocks} fallback={question.stem} textClassName="text-xl font-black leading-8" />
          </div>
          <QuestionAnswerInput
            answer={answers[question.id] ?? ""}
            disabled={paused}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            question={question}
          />
        </section>
      ))}
      <div className="pixel-panel flex flex-wrap gap-3 p-5">
        <SubmitButton className="px-4 py-2" data-action="submit" disabled={paused} label="提交试卷" />
        <Link href={"/papers" as Route} className="pixel-button bg-white px-4 py-2">
          返回试卷
        </Link>
      </div>
    </form>
  );
}

function QuestionAnswerInput({
  question,
  answer,
  disabled,
  onChange
}: {
  question: ReadyPaper["questions"][number];
  answer: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (question.kind === "short_answer" || question.kind === "case_analysis") {
    return (
      <TextareaField
        disabled={disabled}
        label="作答内容"
        name={`control_${question.id}`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入作答内容"
        textareaClassName={question.kind === "case_analysis" ? "min-h-56" : "min-h-32"}
        value={answer}
      />
    );
  }

  if (question.kind === "blank") {
    return (
      <TextField
        disabled={disabled}
        inputClassName="p-3"
        label="填空答案"
        name={`answer_${question.id}`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入填空答案"
        value={answer}
      />
    );
  }

  if (question.kind === "true_false") {
    return (
      <div className="grid gap-3">
        {[
          { key: "true", text: "正确" },
          { key: "false", text: "错误" }
        ].map((option) => (
          <PixelChoice key={option.key} checked={answer === option.key} disabled={disabled} name={`control_${question.id}`} onChange={() => onChange(option.key)} type="radio" value={option.key}>
            {option.text}
          </PixelChoice>
        ))}
      </div>
    );
  }

  if (question.kind === "multiple_choice") {
    const selected = new Set(answer.split(",").filter(Boolean));

    return (
      <div className="grid gap-3">
        {question.options.map((option) => (
          <PixelChoice
            key={option.key}
            checked={selected.has(option.key)}
            disabled={disabled}
            name={`control_${question.id}`}
            onChange={(event) => {
              const next = new Set(selected);

              if (event.target.checked) {
                next.add(option.key);
              } else {
                next.delete(option.key);
              }

              onChange([...next].sort().join(","));
            }}
            type="checkbox"
            value={option.key}
          >
            <span>
              <span className="mr-2 font-black">{option.key}.</span>
              <RichContent blocks={option.blocks} fallback={option.text} inline textClassName="font-bold" />
            </span>
          </PixelChoice>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {question.options.map((option) => (
        <PixelChoice key={option.key} checked={answer === option.key} disabled={disabled} name={`control_${question.id}`} onChange={() => onChange(option.key)} type="radio" value={option.key}>
          <span>
            <span className="mr-2 font-black">{option.key}.</span>
            <RichContent blocks={option.blocks} fallback={option.text} inline textClassName="font-bold" />
          </span>
        </PixelChoice>
      ))}
    </div>
  );
}

function saveStatusLabel(status: SaveStatus) {
  return {
    idle: "待保存",
    saving: "保存中",
    saved: "已保存",
    failed: "保存失败"
  }[status];
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}
