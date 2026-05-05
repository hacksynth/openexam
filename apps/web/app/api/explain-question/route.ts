import { NextResponse } from "next/server";
import { generateQuestionExplanation } from "@openexam/core/ai";
import { getWebSession } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getWebSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "请先登录。" }, { status: 401 });
  }

  const formData = await request.formData();
  const questionId = String(formData.get("questionId") ?? "").trim();

  if (!questionId) {
    return NextResponse.json({ ok: false, error: "缺少题目 ID。" }, { status: 400 });
  }

  const result = await generateQuestionExplanation(session.user.id, questionId);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ ok: true, analysis: result.data.analysis, aiCallId: result.data.aiCallId });
}
