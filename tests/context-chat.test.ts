import { describe, expect, it } from "vitest";
import { buildContextChatPrompt, sendContextChatMessage } from "@openexam/core/context-chat";

describe("context chat", () => {
  it("builds a prompt with context and recent history", () => {
    const prompt = buildContextChatPrompt({
      title: "资料：事务笔记",
      contextSource: "material:material_1",
      contextBody: "事务隔离级别包括读未提交、读已提交、可重复读和串行化。",
      history: [{ role: "user", content: "解释一下隔离性" }],
      message: "给我一个易错点"
    });

    expect(prompt.instructions).toContain("上下文学习助手");
    expect(prompt.input).toContain("material:material_1");
    expect(prompt.input).toContain("解释一下隔离性");
    expect(prompt.input).toContain("给我一个易错点");
  });

  it("checks material ownership before creating a chat thread", async () => {
    const calls: { method: string; args?: unknown }[] = [];
    const db = {
      material: {
        findFirst: async (args: unknown) => {
          calls.push({ method: "material.findFirst", args });
          return null;
        }
      }
    };

    await expect(
      sendContextChatMessage(
        "user_1",
        {
          contextType: "material",
          contextId: "material_1",
          message: "这份资料讲什么？"
        },
        { db: db as never, generateText: async () => ({ text: "不会调用" }) }
      )
    ).resolves.toEqual({
      ok: false,
      error: "资料不存在或不可访问。"
    });
    expect(calls[0]).toEqual({
      method: "material.findFirst",
      args: {
        where: {
          id: "material_1",
          ownerId: "user_1",
          libraryScope: "personal"
        },
        select: {
          id: true,
          title: true
        }
      }
    });
  });
});
