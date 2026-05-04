import { describe, expect, it } from "vitest";
import { validatePaperInput } from "@openexam/core/paper-admin";

const validPaper = {
  title: "软考软件设计师基础知识样例卷",
  slug: "software-designer-basic-sample",
  paperType: "sample",
  visibility: "public",
  subjectId: "subject_1",
  questions: [
    {
      questionId: "question_1",
      order: "1",
      number: "1",
      section: "基础知识",
      score: "1"
    },
    {
      questionId: "question_2",
      order: "2",
      number: "2",
      section: "基础知识",
      score: "2"
    }
  ]
};

describe("paper admin validation", () => {
  it("accepts a valid paper with ordered questions", () => {
    expect(validatePaperInput(validPaper)).toEqual({
      ok: true,
      data: {
        title: validPaper.title,
        slug: validPaper.slug,
        paperType: "sample",
        visibility: "public",
        subjectId: "subject_1",
        questions: [
          { questionId: "question_1", order: 1, number: "1", section: "基础知识", score: 1 },
          { questionId: "question_2", order: 2, number: "2", section: "基础知识", score: 2 }
        ]
      }
    });
  });

  it("requires at least one question", () => {
    expect(validatePaperInput({ ...validPaper, questions: [] })).toEqual({
      ok: false,
      error: "试卷至少需要绑定 1 道题。"
    });
  });

  it("rejects duplicate question orders", () => {
    expect(
      validatePaperInput({
        ...validPaper,
        questions: [
          validPaper.questions[0],
          {
            ...validPaper.questions[1],
            order: "1"
          }
        ]
      })
    ).toEqual({
      ok: false,
      error: "题序不能重复。"
    });
  });

  it("rejects duplicate question bindings", () => {
    expect(
      validatePaperInput({
        ...validPaper,
        questions: [
          validPaper.questions[0],
          {
            ...validPaper.questions[1],
            questionId: "question_1"
          }
        ]
      })
    ).toEqual({
      ok: false,
      error: "同一试卷不能重复绑定同一道题。"
    });
  });

  it("rejects invalid scores", () => {
    expect(
      validatePaperInput({
        ...validPaper,
        questions: [
          {
            ...validPaper.questions[0],
            score: "0"
          }
        ]
      })
    ).toEqual({
      ok: false,
      error: "分值必须是大于 0 的数字。"
    });
  });
});
