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

    const isExtraction = String(body.input ?? "").includes("资料正文");
    const knowledgeNodeId = String(body.input ?? "").match(/(cm[a-z0-9]+)/)?.[1] ?? "";
    const text = isExtraction
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
