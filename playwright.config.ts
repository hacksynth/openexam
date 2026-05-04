import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public";
const sessionSecret = process.env.SESSION_SECRET ?? "openexam-e2e-session-secret";
const fakeAiResponse = process.env.OPENEXAM_FAKE_AI_RESPONSE ?? "AI E2E 解析：原子性要求事务中的操作要么全部成功，要么全部失败。";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  use: {
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: sessionSecret,
        AI_KEY_ENCRYPTION_SECRET: "openexam-e2e-ai-key-secret",
        OPENEXAM_FAKE_AI_RESPONSE: fakeAiResponse,
        PORT: "3000"
      }
    },
    {
      command: "npm run dev:admin",
      url: "http://127.0.0.1:3001",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: sessionSecret,
        PORT: "3001"
      }
    }
  ]
});
