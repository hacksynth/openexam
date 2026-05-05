import { describe, expect, it } from "vitest";
import { readEnv } from "@openexam/core/env";

describe("environment parsing", () => {
  it("treats empty optional settings from compose env files as unset", () => {
    expect(
      readEnv({
        DATABASE_URL: "postgresql://openexam:openexam@localhost:5432/openexam?schema=public",
        AUTH_SECRET: "",
        AUTH_URL: "",
        AI_KEY_ENCRYPTION_SECRET: "",
        OPENAI_BASE_URL: "",
        AWS_PROFILE: ""
      })
    ).toMatchObject({
      AUTH_SECRET: undefined,
      AUTH_URL: undefined,
      AI_KEY_ENCRYPTION_SECRET: undefined,
      OPENAI_BASE_URL: undefined,
      AWS_PROFILE: undefined,
      OPENEXAM_MATERIAL_EXTRACT_TIMEOUT_MS: 1200000,
      OPENEXAM_MATERIAL_EXTRACT_JOB_STALE_MS: 1500000
    });
  });
});
