export const allowedPublicSourceTypes = [
  "original",
  "authorized",
  "public_domain_or_open"
] as const;

export type QuestionVisibility = "private" | "unlisted" | "public";

export type QuestionSourceType =
  | "original"
  | "authorized"
  | "public_domain_or_open"
  | "user_uploaded"
  | "ai_generated"
  | "unknown";

export type QuestionReviewStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_changes"
  | "takedown";

export type PublicationInput = {
  visibility: QuestionVisibility;
  sourceType: QuestionSourceType;
  reviewStatus: QuestionReviewStatus;
};

export type PublicationDecision = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateQuestionPublication(input: PublicationInput): PublicationDecision {
  const reasons: string[] = [];

  if (input.visibility !== "public") {
    return { allowed: true, reasons };
  }

  if (input.reviewStatus !== "approved") {
    reasons.push("Public questions must be approved.");
  }

  if (input.reviewStatus === "takedown") {
    reasons.push("Takedown questions cannot be publicly visible.");
  }

  if (!allowedPublicSourceTypes.includes(input.sourceType as (typeof allowedPublicSourceTypes)[number])) {
    reasons.push("Public questions require original, authorized, or public/open source status.");
  }

  if (input.sourceType === "unknown") {
    reasons.push("Unknown-source questions cannot be public.");
  }

  if (input.sourceType === "ai_generated") {
    reasons.push("AI-generated questions stay private until manually sourced and reviewed.");
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}
