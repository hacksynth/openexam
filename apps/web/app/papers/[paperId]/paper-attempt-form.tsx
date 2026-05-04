"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import type { PaperAttemptState } from "@openexam/core/papers";
import { submitPaperAttemptAction } from "../actions";

type ReadyPaper = Extract<PaperAttemptState, { status: "ready" }>["paper"];

export function PaperAttemptForm({ paper }: { paper: ReadyPaper }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
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
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <form
      action={submitPaperAttemptAction}
      className="grid gap-4"
      onSubmit={(event) => {
        if (unansweredCount > 0 && !window.confirm(`还有 ${unansweredCount} 道题未作答，未答题将按 0 分处理。确认提交？`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="paperId" type="hidden" value={paper.id} />
      <section className="pixel-panel sticky top-3 z-10 grid gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="status-chip px-2 py-1">已答 {answeredCount} / {paper.questions.length}</span>
            <span className="status-chip px-2 py-1">未答 {unansweredCount}</span>
            <span className="status-chip px-2 py-1">用时 {formatDuration(elapsedSeconds)}</span>
          </div>
          <button className="pixel-button px-4 py-2" type="submit">
            提交试卷
          </button>
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
          <div className="grid gap-3">
            {question.options.map((option) => (
              <label key={option.key} className="flex min-w-0 gap-3 border-2 border-black bg-[var(--surface-subtle)] p-3 font-bold">
                <input
                  className="mt-1 h-5 w-5 shrink-0 accent-black"
                  name={`answer_${question.id}`}
                  onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.key }))}
                  type="radio"
                  value={option.key}
                />
                <span className="min-w-0 break-words">
                  {option.key}. {option.text}
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}
      <div className="pixel-panel flex flex-wrap gap-3 p-5">
        <button className="pixel-button px-4 py-2" type="submit">
          提交试卷
        </button>
        <Link href={"/papers" as Route} className="pixel-button bg-white px-4 py-2">
          返回试卷
        </Link>
      </div>
    </form>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}
