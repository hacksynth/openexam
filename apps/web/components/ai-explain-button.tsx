"use client";

import { type FormEvent, useCallback, useState, useTransition } from "react";

export function AiExplainButton({ questionId }: { questionId: string }) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const formData = new FormData(e.currentTarget);

      startTransition(async () => {
        try {
          const res = await fetch("/api/explain-question", {
            method: "POST",
            body: formData
          });

          if (!res.ok) {
            const text = await res.text();
            setError(text || "解析失败");
            return;
          }

          const data = await res.json();

          if (data.ok) {
            setExplanation(data.analysis);
          } else {
            setError(data.error ?? "解析失败");
          }
        } catch {
          setError("请求失败，请重试。");
        }
      });
    },
    [startTransition]
  );

  return (
    <div className="grid gap-3">
      {!explanation ? (
        <form onSubmit={handleSubmit} className="inline-block">
          <input name="questionId" type="hidden" value={questionId} />
          <button className="pixel-button bg-white px-4 py-2" disabled={isPending} type="submit">
            {isPending ? "AI 解析中..." : "AI 解析本题"}
          </button>
        </form>
      ) : null}
      {error ? <p className="border-2 border-[var(--danger)] bg-red-50 p-3 text-sm font-bold text-[var(--danger)]">{error}</p> : null}
      {explanation ? (
        <div className="border-2 border-black bg-[var(--ai-soft)] p-3">
          <p className="text-sm font-bold text-[var(--muted)]">AI 解析</p>
          <p className="mt-1 whitespace-pre-line leading-7">{explanation}</p>
        </div>
      ) : null}
    </div>
  );
}
