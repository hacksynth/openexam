import { defineConfig } from "@playwright/test";

const databaseUrl = envOrDefault("DATABASE_URL", "postgresql://openexam:openexam@localhost:5432/openexam?schema=public");
const sessionSecret = envOrDefault("SESSION_SECRET", "openexam-e2e-session-secret");
const openAiBaseUrl = envOrDefault("OPENAI_BASE_URL", "http://127.0.0.1:8317/v1");
const webUrl = envOrDefault("E2E_WEB_URL", "http://127.0.0.1:3000");

function envOrDefault(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function portFromUrl(value: string, fallback: string) {
  try {
    return new URL(value).port || fallback;
  } catch {
    return fallback;
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 15_000
  },
  use: {
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "node e2e/openai-mock.mjs",
      url: "http://127.0.0.1:8317/health",
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: "npm run dev:web",
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: sessionSecret,
        AI_KEY_ENCRYPTION_SECRET: "openexam-e2e-ai-key-secret",
        OPENAI_BASE_URL: openAiBaseUrl,
        PORT: portFromUrl(webUrl, "3000")
      }
    }
  ]
});
