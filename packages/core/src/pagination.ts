export const pageSizeOptions = [10, 20, 50] as const;

export type PageSizeOption = (typeof pageSizeOptions)[number];

export type PaginationInput = {
  page?: string | number | null;
  pageSize?: string | number | null;
};

export type PaginationMeta = {
  page: number;
  pageSize: PageSizeOption;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  previousPage: number | null;
  nextPage: number | null;
};

export type PaginationWindow = PaginationMeta & {
  skip: number;
  take: PageSizeOption;
};

export function parsePageSize(value: string | number | null | undefined): PageSizeOption {
  const parsed = Number(value);

  return pageSizeOptions.includes(parsed as PageSizeOption) ? (parsed as PageSizeOption) : 20;
}

export function parsePage(value: string | number | null | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function buildPagination(input: PaginationInput | undefined, totalItems: number): PaginationWindow {
  const pageSize = parsePageSize(input?.pageSize);
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
  const page = Math.min(parsePage(input?.page), totalPages);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    previousPage: page > 1 ? page - 1 : null,
    nextPage: page < totalPages ? page + 1 : null,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}
