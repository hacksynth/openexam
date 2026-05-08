import { describe, expect, it } from "vitest";
import { normalizeWrongNoteFilter, wrongNoteHref } from "../apps/web/app/wrong-notes/filters";

describe("wrong note filters", () => {
  it("defaults the wrong-note book to pending notes", () => {
    expect(normalizeWrongNoteFilter(undefined)).toBe("pending");
    expect(normalizeWrongNoteFilter("unknown")).toBe("pending");
  });

  it("preserves active filters in wrong-note links", () => {
    expect(
      wrongNoteHref({
        filter: "mastered",
        knowledgeNodeId: "node_1",
        minErrorCount: "2",
        questionKind: "single_choice"
      })
    ).toBe("/wrong-notes?filter=mastered&knowledgeNodeId=node_1&minErrorCount=2&questionKind=single_choice");
  });
});
