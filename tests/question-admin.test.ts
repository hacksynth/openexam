import { describe, expect, it } from "vitest";
import { normalizeAdminQuestionFilters, validateSingleChoiceQuestionImportPayload, validateSingleChoiceQuestionInput } from "@openexam/core/question-admin";

const validInput = {
  stem: "以下哪项属于对称加密算法？",
  optionA: "AES",
  optionB: "RSA",
  optionC: "SHA-256",
  optionD: "DSA",
  answer: "A",
  explanation: "AES 是常见对称加密算法。",
  difficulty: "2",
  knowledgeNodeId: "node-1",
  visibility: "public",
  sourceType: "original",
  reviewStatus: "approved"
};

describe("single-choice question admin validation", () => {
  it("accepts a valid approved original public question", () => {
    const result = validateSingleChoiceQuestionInput(validInput);

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        stem: validInput.stem,
        difficulty: 2,
        answerKey: { value: "A" },
        visibility: "public",
        sourceType: "original",
        reviewStatus: "approved"
      }
    });
  });

  it("requires all four options", () => {
    expect(validateSingleChoiceQuestionInput({ ...validInput, optionC: " " })).toEqual({
      ok: false,
      error: "A/B/C/D 四个选项都必须填写。"
    });
  });

  it("requires answer to be one of A/B/C/D", () => {
    expect(validateSingleChoiceQuestionInput({ ...validInput, answer: "E" })).toEqual({
      ok: false,
      error: "正确答案只能是 A、B、C 或 D。"
    });
  });

  it("blocks public questions that are not approved", () => {
    expect(validateSingleChoiceQuestionInput({ ...validInput, reviewStatus: "draft" })).toEqual({
      ok: false,
      error: "公开题必须是已审核通过状态。"
    });
  });

  it("blocks invalid difficulty values", () => {
    expect(validateSingleChoiceQuestionInput({ ...validInput, difficulty: "8" })).toEqual({
      ok: false,
      error: "难度必须是 1 到 5 的整数，或留空。"
    });
  });
});

describe("single-choice question JSON import validation", () => {
  it("accepts an array of valid import items", () => {
    const result = validateSingleChoiceQuestionImportPayload({
      jsonPayload: JSON.stringify([
        {
          stem: validInput.stem,
          options: {
            A: validInput.optionA,
            B: validInput.optionB,
            C: validInput.optionC,
            D: validInput.optionD
          },
          answer: "A",
          explanation: validInput.explanation,
          difficulty: 2,
          knowledgeNodeId: "node-1",
          visibility: "public",
          sourceType: "original",
          reviewStatus: "approved"
        }
      ])
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        questions: [
          {
            stem: validInput.stem,
            answerKey: { value: "A" },
            knowledgeNodeId: "node-1"
          }
        ]
      }
    });
  });

  it("rejects invalid JSON and empty arrays", () => {
    expect(validateSingleChoiceQuestionImportPayload({ jsonPayload: "{" })).toEqual({
      ok: false,
      error: "JSON 格式无效。"
    });
    expect(validateSingleChoiceQuestionImportPayload({ jsonPayload: "[]" })).toEqual({
      ok: false,
      error: "导入内容必须是非空题目数组。"
    });
  });

  it("returns row-numbered validation errors", () => {
    expect(
      validateSingleChoiceQuestionImportPayload({
        jsonPayload: JSON.stringify([{ ...validInput, answer: "E" }])
      })
    ).toEqual({
      ok: false,
      error: "第 1 题：正确答案只能是 A、B、C 或 D。"
    });
  });
});

describe("admin question filters", () => {
  it("normalizes supported filters and ignores invalid filter values", () => {
    expect(
      normalizeAdminQuestionFilters({
        q: "  数据库  ",
        visibility: "public",
        sourceType: "original",
        reviewStatus: "approved",
        difficulty: "3",
        archived: "all"
      })
    ).toEqual({
      q: "数据库",
      knowledgeNodeId: null,
      visibility: "public",
      sourceType: "original",
      reviewStatus: "approved",
      difficulty: 3,
      archived: "all"
    });

    expect(normalizeAdminQuestionFilters({ visibility: "bad", difficulty: "9", archived: "bad" })).toMatchObject({
      visibility: null,
      difficulty: null,
      archived: "active"
    });
  });
});
