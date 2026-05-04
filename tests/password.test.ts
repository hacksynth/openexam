import { describe, expect, it } from "vitest";
import { hashPassword, validatePassword, verifyPassword } from "@openexam/core/password";
import { createSessionToken, hashSessionToken, userHasRole } from "@openexam/core/auth";

describe("password helpers", () => {
  it("hashes and verifies valid passwords", async () => {
    const hash = await hashPassword("correct-password");

    expect(hash).not.toContain("correct-password");
    await expect(verifyPassword("correct-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("requires at least eight password characters", () => {
    expect(validatePassword("1234567")).toBe(false);
    expect(validatePassword("12345678")).toBe(true);
  });
});

describe("session helpers", () => {
  it("hashes session tokens before storage", () => {
    process.env.SESSION_SECRET = "test-secret";
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    expect(token).not.toEqual(tokenHash);
    expect(tokenHash).toHaveLength(64);
  });

  it("checks admin role explicitly", () => {
    expect(userHasRole({ id: "1", email: "a@example.com", name: null, role: "admin" }, "admin")).toBe(true);
    expect(userHasRole({ id: "2", email: "u@example.com", name: null, role: "user" }, "admin")).toBe(false);
  });
});
