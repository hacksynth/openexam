import { createServer } from "node:http";

const port = Number(process.env.OPENEXAM_E2E_OPENAI_PORT ?? 8317);
const failedKeyCounts = new Map();
let responseCount = 0;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/reset") {
    failedKeyCounts.clear();
    responseCount = 0;
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/responses") {
    responseCount += 1;
    const body = await readJson(request);
    const authorization = request.headers.authorization ?? "";
    const model = typeof body.model === "string" ? body.model : "gpt-5.5";

    if (shouldFailTextRequest(authorization)) {
      sendJson(response, 500, {
        error: {
          message: "Mock OpenAI failure: upstream temporarily unavailable"
        }
      });
      return;
    }

    const text = buildMockTextResponse(readPromptText(body));

    sendJson(response, 200, {
      id: `resp_mock_${Date.now()}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      model,
      output_text: text,
      output: [
        {
          id: "msg_mock",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text
            }
          ]
        }
      ],
      usage: {
        input_tokens: 128,
        output_tokens: 36,
        total_tokens: 164
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    responseCount += 1;
    const body = await readJson(request);
    const authorization = request.headers.authorization ?? "";
    const model = typeof body.model === "string" ? body.model : "gpt-5.5";

    if (shouldFailTextRequest(authorization)) {
      sendJson(response, 500, {
        error: {
          message: "Mock OpenAI failure: upstream temporarily unavailable"
        }
      });
      return;
    }

    const text = buildMockTextResponse(readPromptText(body));

    sendJson(response, 200, {
      id: `chatcmpl_mock_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: text
          }
        }
      ],
      usage: {
        prompt_tokens: 128,
        completion_tokens: 36,
        total_tokens: 164
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/messages") {
    responseCount += 1;
    const body = await readJson(request);
    const apiKey = request.headers["x-api-key"] ?? "";
    const model = typeof body.model === "string" ? body.model : "claude-3-5-sonnet-latest";

    if (shouldFailTextRequest(String(apiKey))) {
      sendJson(response, 500, {
        error: {
          message: "Mock Anthropic failure: upstream temporarily unavailable"
        }
      });
      return;
    }

    const text = buildMockTextResponse(readPromptText(body));

    sendJson(response, 200, {
      id: `msg_mock_${Date.now()}`,
      type: "message",
      role: "assistant",
      model,
      content: [
        {
          type: "text",
          text
        }
      ],
      usage: {
        input_tokens: 128,
        output_tokens: 36
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/v1beta/models/") && url.pathname.endsWith(":generateContent")) {
    responseCount += 1;
    const body = await readJson(request);
    const apiKey = request.headers["x-goog-api-key"] ?? "";
    const model = url.pathname.split("/").at(-1)?.replace(":generateContent", "") ?? "gemini-1.5-pro";

    if (shouldFailTextRequest(String(apiKey))) {
      sendJson(response, 500, {
        error: {
          message: "Mock Gemini failure: upstream temporarily unavailable"
        }
      });
      return;
    }

    const text = buildMockTextResponse(readPromptText(body));

    sendJson(response, 200, {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text
              }
            ]
          },
          finishReason: "STOP"
        }
      ],
      modelVersion: model,
      usageMetadata: {
        promptTokenCount: 128,
        candidatesTokenCount: 36,
        totalTokenCount: 164
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/images/generations") {
    const body = await readJson(request);
    const authorization = request.headers.authorization ?? "";
    const failedCount = failedKeyCounts.get(`image:${authorization}`) ?? 0;
    const shouldFailKey = authorization.includes("fail-once") && failedCount < 3;
    const model = typeof body.model === "string" ? body.model : "gpt-image-1.5";

    if (shouldFailKey) {
      failedKeyCounts.set(`image:${authorization}`, failedCount + 1);
      sendJson(response, 500, {
        error: {
          message: "Mock OpenAI image failure: upstream temporarily unavailable"
        }
      });
      return;
    }

    sendJson(response, 200, {
      created: Math.floor(Date.now() / 1000),
      model,
      data: [
        {
          b64_json:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
        }
      ],
      output_format: "png",
      size: "1024x1536",
      quality: "medium",
      usage: {
        input_tokens: 64,
        output_tokens: 32,
        total_tokens: 96
      }
    });
    return;
  }

  sendJson(response, 404, { error: { message: "Not found" } });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`OpenAI mock listening on http://127.0.0.1:${port}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify(payload));
}

function shouldFailTextRequest(authorization) {
  const failedCount = failedKeyCounts.get(authorization) ?? 0;
  const shouldFailKey = authorization.includes("fail-once") && failedCount < 3;

  if (shouldFailKey) {
    failedKeyCounts.set(authorization, failedCount + 1);
  }

  return shouldFailKey;
}

function buildMockTextResponse(input) {
  const isExtraction = input.includes("资料正文");
  const isPlan = input.includes("计划窗口：") && input.includes("学习计划");
  const isPracticeGeneration = input.includes("请为当前考试目标生成") && input.includes("练习题候选");
  const isDiagnosis = input.includes("请基于当前考试目标、作答统计、错题和薄弱知识点生成学习诊断。");
  const knowledgeNodeId = input.match(/(cm[a-z0-9]+)/)?.[1] ?? "";
  const goalId = input.match(/目标 ID：([^\n]+)/)?.[1]?.trim() ?? "goal_mock";

  if (isPlan) {
    const windowMatch = input.match(/计划窗口：(\d{4}-\d{2}-\d{2}) 至 (\d{4}-\d{2}-\d{2})，共 (\d+) 天/);
    const startDate = windowMatch?.[1] ?? "2026-05-05";
    const days = Math.max(1, Math.min(30, Number(windowMatch?.[3] ?? 14)));
    const decisionIds = [...input.matchAll(/(task_[a-zA-Z0-9_-]+)/g)].map((match) => match[1]);

    return JSON.stringify({
      goalId,
      generatedAt: new Date().toISOString(),
      days,
      decisions: [...new Set(decisionIds)].map((taskId) => ({
        taskId,
        status: "carried_over",
        reason: "合并到新的滚动计划"
      })),
      tasks: Array.from({ length: days }, (_, index) => {
        const scheduledDate = addDays(startDate, index);

        return {
          day: index + 1,
          scheduledDate,
          title: `第 ${index + 1} 天复习事务基础并完成单选练习`,
          kind: index % 5 === 4 ? "wrong_note_review" : "practice",
          minutes: 45,
          knowledgeNodeIds: knowledgeNodeId ? [knowledgeNodeId] : []
        };
      })
    });
  }

  if (isExtraction) {
    return JSON.stringify({
      questions: [
        {
          stem: "E2E 资料抽题：事务原子性最准确的含义是什么？",
          options: {
            A: "事务中的操作要么全部成功，要么全部失败。",
            B: "并发事务之间互不影响。",
            C: "事务提交后数据永久保存。",
            D: "事务执行前后数据库满足约束。"
          },
          answer: "A",
          explanation: "原子性强调事务不可分割，不能只成功一部分。",
          difficulty: 2,
          knowledgeNodeId,
          sourceRef: "E2E 资料第 1 段"
        }
      ]
    });
  }

  if (isPracticeGeneration) {
    return JSON.stringify({
      questions: [
        {
          stem: "E2E AI 出题：事务原子性最准确的含义是什么？",
          options: {
            A: "事务中的操作要么全部成功，要么全部失败。",
            B: "多个事务可以同时读取同一份数据。",
            C: "事务提交后数据不会丢失。",
            D: "事务执行前后数据库约束保持一致。"
          },
          answer: "A",
          explanation: "原子性强调事务不可分割，全部操作要么一起成功，要么一起失败。",
          difficulty: 2,
          knowledgeNodeId,
          sourceRef: "E2E AI 生成"
        }
      ]
    });
  }

  if (isDiagnosis) {
    return JSON.stringify({
      summary: "当前测试账号已完成资料题练习并产生错题，主要风险集中在事务 ACID 概念辨析。建议优先复盘原子性与隔离性的边界，再用错题重练巩固。",
      weakKnowledgeNodeIds: knowledgeNodeId ? [knowledgeNodeId] : [],
      recommendations: ["重练事务 ACID 单选题", "整理原子性与隔离性的对比笔记", "完成一次错题复习卡回看"]
    });
  }

  return "AI E2E 解析：原子性要求事务中的操作要么全部成功，要么全部失败。复习时要区分原子性和隔离性。";
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readPromptText(body) {
  if (typeof body.input !== "undefined") {
    return stringifyPromptContent(body.input);
  }

  if (Array.isArray(body.messages)) {
    return body.messages.map((message) => stringifyPromptContent(message?.content)).join("\n");
  }

  if (Array.isArray(body.contents)) {
    return body.contents.map((content) => stringifyPromptContent(content?.parts)).join("\n");
  }

  return "";
}

function stringifyPromptContent(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyPromptContent(item)).join("\n");
  }

  if (value && typeof value === "object" && "text" in value) {
    return String(value.text ?? "");
  }

  if (value && typeof value === "object" && "content" in value) {
    return stringifyPromptContent(value.content);
  }

  return String(value ?? "");
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
