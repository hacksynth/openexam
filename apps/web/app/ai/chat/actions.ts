"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { sendContextChatMessage } from "@openexam/core/context-chat";
import { requireWebSession } from "@/lib/auth";

export async function sendContextChatMessageAction(formData: FormData) {
  const session = await requireWebSession();
  const threadId = optionalText(value(formData, "threadId"));
  const contextType = optionalText(value(formData, "contextType"));
  const contextId = optionalText(value(formData, "contextId"));
  const result = await sendContextChatMessage(session.user.id, {
    threadId,
    contextType,
    contextId,
    message: value(formData, "message")
  });

  revalidatePath("/ai/chat" as Route);
  revalidatePath("/ai/tasks" as Route);

  if (!result.ok) {
    redirect(chatRedirect({ threadId, contextType, contextId, error: result.error }));
  }

  redirect(chatRedirect({ threadId: result.data.threadId, notice: "AI 已回复。" }));
}

function chatRedirect(input: { threadId?: string | null; contextType?: string | null; contextId?: string | null; error?: string; notice?: string }) {
  const params = new URLSearchParams();

  if (input.threadId) {
    params.set("thread", input.threadId);
  } else {
    if (input.contextType) {
      params.set("contextType", input.contextType);
    }

    if (input.contextId) {
      params.set("contextId", input.contextId);
    }
  }

  if (input.error) {
    params.set("error", input.error);
  }

  if (input.notice) {
    params.set("notice", input.notice);
  }

  const query = params.toString();

  return (query ? `/ai/chat?${query}` : "/ai/chat") as Route;
}

function optionalText(value: string) {
  const text = value.trim();

  return text || null;
}

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "");
}
