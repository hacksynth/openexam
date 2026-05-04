import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://openexam:openexam@localhost:5432/openexam?schema=public";
const sessionSecret = process.env.SESSION_SECRET ?? "openexam-e2e-session-secret";

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
