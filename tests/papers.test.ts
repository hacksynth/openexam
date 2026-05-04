import { describe, expect, it } from "vitest";
import { gradePaperSubmission, summarizeAttemptReportAnswers } from "@openexam/core/papers";

describe("gradePaperSubmission", () => {
  const questions = [
    {
      questionId: "question_1",
      questionVersionId: "version_1",
      answerKey: { value: "A" },
      score: 1
    },
    {
      questionId: "question_2",
      questionVersionId: "version_2",
      answerKey: { value: "C" },
      score: 2
    }
  ];

  it("grades all correct paper answers", () => {
    expect(gradePaperSubmission(questions, { question_1: "A", question_2: "C" })).toMatchObject({
      ok: true,
      data: {
        totalScore: 3,
        maxScore: 3,
        answers: [
          { questionId: "question_1", isCorrect: true, score: 1, maxScore: 1 },
          { questionId: "question_2", isCorrect: true, score: 2, maxScore: 2 }
        ]
      }
    });
  });

  it("grades wrong and unanswered questions as zero", () => {
    expect(gradePaperSubmission(questions, { question_1: "B" })).toMatchObject({
      ok: true,
      data: {
        totalScore: 0,
        maxScore: 3,
        answers: [
          { questionId: "question_1", isCorrect: false, score: 0, maxScore: 1, userAnswer: { value: "B" } },
          { questionId: "question_2", isCorrect: false, score: 0, maxScore: 2, userAnswer: { value: "" } }
        ]
      }
    });
  });

  it("rejects questions without answer keys", () => {
    expect(gradePaperSubmission([{ ...questions[0], answerKey: null }], { question_1: "A" })).toEqual({
      ok: false,
      error: "试卷包含答案配置不完整的题目。"
    });
  });
});

describe("summarizeAttemptReportAnswers", () => {
  it("summarizes score, accuracy, unanswered count, and knowledge nodes", () => {
    expect(
      summarizeAttemptReportAnswers([
        { isCorrect: true, score: 1, maxScore: 1, userAnswer: "A", knowledgeNodes: ["事务基础"] },
        { isCorrect: false, score: 0, maxScore: 2, userAnswer: "B", knowledgeNodes: ["事务基础", "数据库规范化"] },
        { isCorrect: false, score: 0, maxScore: 1, userAnswer: "", knowledgeNodes: [] }
      ])
    ).toEqual({
      totalQuestions: 3,
      correctCount: 1,
      wrongCount: 2,
      unansweredCount: 1,
      totalScore: 1,
      maxScore: 4,
      accuracy: 33,
      scoreRate: 25,
      knowledgeStats: [
        { title: "事务基础", total: 2, correct: 1, wrong: 1, score: 1, maxScore: 3 },
        { title: "数据库规范化", total: 1, correct: 0, wrong: 1, score: 0, maxScore: 2 },
        { title: "未绑定知识点", total: 1, correct: 0, wrong: 1, score: 0, maxScore: 1 }
      ]
    });
  });
});
