export const wrongNoteFilterOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "未掌握" },
  { value: "mastered", label: "已掌握" }
] as const;

export type WrongNoteFilter = (typeof wrongNoteFilterOptions)[number]["value"];

export function normalizeWrongNoteFilter(value: string | undefined): WrongNoteFilter {
  return wrongNoteFilterOptions.some((option) => option.value === value) ? (value as WrongNoteFilter) : "pending";
}

export function wrongNoteHref({
  filter,
  knowledgeNodeId,
  minErrorCount,
  page,
  pageSize,
  questionKind
}: {
  filter: string;
  knowledgeNodeId: string;
  minErrorCount?: string;
  page?: string | number;
  pageSize?: string | number;
  questionKind?: string;
}) {
  const params = new URLSearchParams();

  params.set("filter", normalizeWrongNoteFilter(filter));

  if (knowledgeNodeId) {
    params.set("knowledgeNodeId", knowledgeNodeId);
  }

  if (minErrorCount) {
    params.set("minErrorCount", minErrorCount);
  }

  if (questionKind) {
    params.set("questionKind", questionKind);
  }

  if (page) {
    params.set("page", String(page));
  }

  if (pageSize) {
    params.set("pageSize", String(pageSize));
  }

  return `/wrong-notes?${params.toString()}`;
}
