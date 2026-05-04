export type ObjectiveQuestionKind = "single_choice" | "multiple_choice" | "true_false" | "blank";

export type GradeResult = {
  isCorrect: boolean;
  score: number;
  maxScore: number;
};

type AnswerValue = string | number | boolean | Array<string | number | boolean>;

function normalizeScalar(value: string | number | boolean) {
  return String(value).trim().toLowerCase();
}

function normalizeSet(value: AnswerValue) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeScalar).sort();
}

export function gradeObjectiveAnswer(
  kind: ObjectiveQuestionKind,
  answerKey: AnswerValue,
  response: AnswerValue,
  maxScore = 1
): GradeResult {
  if (kind === "multiple_choice") {
    const expected = normalizeSet(answerKey);
    const actual = normalizeSet(response);
    const isCorrect = expected.length === actual.length && expected.every((item, index) => item === actual[index]);

    return {
      isCorrect,
      score: isCorrect ? maxScore : 0,
      maxScore
    };
  }

  const expected = normalizeScalar(Array.isArray(answerKey) ? answerKey[0] : answerKey);
  const actual = normalizeScalar(Array.isArray(response) ? response[0] : response);
  const isCorrect = expected === actual;

  return {
    isCorrect,
    score: isCorrect ? maxScore : 0,
    maxScore
  };
}
