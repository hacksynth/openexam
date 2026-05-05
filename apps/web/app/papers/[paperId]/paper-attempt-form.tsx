"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import type { PaperAttemptSessionState } from "@openexam/core/papers";
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
              <button className="pixel-button bg-white px-4 py-2" formAction={resumePaperAttemptAction} type="submit">
                恢复
              </button>
            ) : (
              <button className="pixel-button bg-white px-4 py-2" formAction={pausePaperAttemptAction} type="submit">
                暂停
              </button>
            )}
            <button className="pixel-button px-4 py-2" data-action="submit" disabled={paused} type="submit">
              提交试卷
            </button>
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
            <h3 className="break-words text-xl font-black leading-8">{question.stem}</h3>
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
        <button className="pixel-button px-4 py-2" data-action="submit" disabled={paused} type="submit">
          提交试卷
        </button>
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
      <textarea
        className="min-h-32 border-3 border-black bg-white p-3 font-bold leading-7"
        disabled={disabled}
        name={`control_${question.id}`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入作答内容"
        value={answer}
      />
    );
  }

  if (question.kind === "blank") {
    return (
      <input
        className="border-3 border-black bg-white p-3 font-bold"
        disabled={disabled}
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
          <label key={option.key} className="flex min-w-0 gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold">
            <input
              checked={answer === option.key}
              className="mt-1 h-5 w-5 shrink-0 accent-black"
              disabled={disabled}
              name={`control_${question.id}`}
              onChange={() => onChange(option.key)}
              type="radio"
              value={option.key}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.kind === "multiple_choice") {
    const selected = new Set(answer.split(",").filter(Boolean));

    return (
      <div className="grid gap-3">
        {question.options.map((option) => (
          <label key={option.key} className="flex min-w-0 gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold">
            <input
              checked={selected.has(option.key)}
              className="mt-1 h-5 w-5 shrink-0 accent-black"
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
            />
            <span className="min-w-0 break-words">
              {option.key}. {option.text}
            </span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {question.options.map((option) => (
        <label key={option.key} className="flex min-w-0 gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold">
          <input
            checked={answer === option.key}
            className="mt-1 h-5 w-5 shrink-0 accent-black"
            disabled={disabled}
            name={`control_${question.id}`}
            onChange={() => onChange(option.key)}
            type="radio"
            value={option.key}
          />
          <span className="min-w-0 break-words">
            {option.key}. {option.text}
          </span>
        </label>
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
