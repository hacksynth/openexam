import { describe, expect, it } from "vitest";
import { buildPagination, parsePageSize } from "@openexam/core/pagination";

describe("pagination", () => {
  it("normalizes page and page size", () => {
    expect(parsePageSize("10")).toBe(10);
    expect(parsePageSize("99")).toBe(20);
    expect(parsePageSize(undefined)).toBe(20);
  });

  it("builds a bounded offset pagination window", () => {
    expect(buildPagination({ page: "3", pageSize: "10" }, 25)).toMatchObject({
      page: 3,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: false,
      previousPage: 2,
      nextPage: null,
      skip: 20,
      take: 10
    });
  });

  it("falls back to the first page when input is invalid", () => {
    expect(buildPagination({ page: "-1", pageSize: "abc" }, 0)).toMatchObject({
      page: 1,
      pageSize: 20,
      totalPages: 1,
      skip: 0,
      take: 20
    });
  });
});
