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
    const failedCount = failedKeyCounts.get(authorization) ?? 0;
    const shouldFailKey = authorization.includes("fail-once") && failedCount < 3;
    const model = typeof body.model === "string" ? body.model : "gpt-5.5";

    if (shouldFailKey) {
      failedKeyCounts.set(authorization, failedCount + 1);
      sendJson(response, 500, {
        error: {
          message: "Mock OpenAI failure: upstream temporarily unavailable"
        }
      });
      return;
    }

    const input = String(body.input ?? "");
    const isExtraction = input.includes("资料正文");
    const isPlan = input.includes("14 天学习计划");
    const knowledgeNodeId = String(body.input ?? "").match(/(cm[a-z0-9]+)/)?.[1] ?? "";
    const goalId = input.match(/目标 ID：([^\n]+)/)?.[1]?.trim() ?? "goal_mock";
    const text = isPlan
      ? JSON.stringify({
          goalId,
          generatedAt: "2026-05-05T00:00:00.000Z",
          days: 14,
          tasks: Array.from({ length: 14 }, (_, index) => ({
            day: index + 1,
            title: `第 ${index + 1} 天复习事务基础并完成单选练习`,
            kind: index % 5 === 4 ? "wrong_note_review" : "practice",
            minutes: 45,
            knowledgeNodeIds: knowledgeNodeId ? [knowledgeNodeId] : []
          }))
        })
      : isExtraction
      ? JSON.stringify({
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
        })
      : "AI E2E 解析：原子性要求事务中的操作要么全部成功，要么全部失败。复习时要区分原子性和隔离性。";

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
