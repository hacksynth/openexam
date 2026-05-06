"use client";

import { useFormStatus } from "react-dom";
import { SubmitButton } from "@openexam/core/pixel-ui";

export function AiAnalysisSubmitButton({ hasAnalysis }: { hasAnalysis: boolean }) {
  const { pending } = useFormStatus();
  const label = hasAnalysis ? "重新生成 AI 解析" : "生成 AI 解析";

  return (
    <SubmitButton className="w-fit bg-white px-4 py-2 disabled:opacity-60" disabled={pending} label={pending ? "生成中..." : label} />
  );
}

export function ReviewCardSubmitButton({ hasCard, busy }: { hasCard: boolean; busy: boolean }) {
  const { pending } = useFormStatus();
  const label = hasCard ? "重新生成复习卡" : "生成复习卡";

  return (
    <SubmitButton className="w-fit bg-white px-4 py-2 disabled:opacity-60" disabled={pending || busy} label={pending ? "排队中..." : busy ? "任务处理中" : label} />
  );
}
