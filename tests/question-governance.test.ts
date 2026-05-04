import { describe, expect, it } from "vitest";
import { evaluateQuestionPublication } from "@/lib/question-governance";

describe("evaluateQuestionPublication", () => {
  it("allows approved original public questions", () => {
    expect(
      evaluateQuestionPublication({
        visibility: "public",
        sourceType: "original",
        reviewStatus: "approved"
      })
    ).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks public questions that are not approved", () => {
    const decision = evaluateQuestionPublication({
      visibility: "public",
      sourceType: "original",
      reviewStatus: "pending_review"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("Public questions must be approved.");
  });

  it("blocks unknown-source public questions", () => {
    const decision = evaluateQuestionPublication({
      visibility: "public",
      sourceType: "unknown",
      reviewStatus: "approved"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("Unknown-source questions cannot be public.");
  });

  it("allows private AI-generated questions", () => {
    expect(
      evaluateQuestionPublication({
        visibility: "private",
        sourceType: "ai_generated",
        reviewStatus: "draft"
      }).allowed
    ).toBe(true);
  });
});
