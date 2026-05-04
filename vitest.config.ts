import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@openexam/core": new URL("./packages/core/src", import.meta.url).pathname
    }
  }
});
