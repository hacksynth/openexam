import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { pageSizeOptions, type PaginationMeta } from "@openexam/core/pagination";
import { SelectField, SubmitButton } from "@openexam/core/pixel-ui";

type PaginationQuery = Record<string, string | number | null | undefined>;

type PaginationProps = {
  basePath: string;
  itemLabel?: string;
  pagination: PaginationMeta;
  params?: PaginationQuery;
};

const ignoredParams = new Set(["error", "notice", "page", "pageSize"]);

export function PaginationHeader({ basePath, itemLabel = "条", pagination, params = {} }: PaginationProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <p className="font-bold text-[var(--muted)]">
        共 {pagination.totalItems} {itemLabel} · 第 {pagination.page} / {pagination.totalPages} 页
      </p>
      <form action={basePath} className="flex flex-wrap items-end gap-2" method="get">
        {hiddenParams(params)}
        <input name="page" type="hidden" value="1" />
        <SelectField defaultValue={String(pagination.pageSize)} label="每页" name="pageSize" selectClassName="min-w-28">
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
        <SubmitButton className="bg-white px-3 py-2" label="应用" />
      </form>
    </div>
  );
}

export function PaginationNav({ basePath, pagination, params = {} }: PaginationProps) {
  return (
    <nav aria-label="分页" className="flex flex-wrap items-center justify-end gap-2">
      <PaginationLink disabled={!pagination.hasPreviousPage} href={pageHref(basePath, params, pagination.previousPage ?? pagination.page, pagination.pageSize)}>
        上一页
      </PaginationLink>
      <span className="status-chip px-3 py-2">
        {pagination.page} / {pagination.totalPages}
      </span>
      <PaginationLink disabled={!pagination.hasNextPage} href={pageHref(basePath, params, pagination.nextPage ?? pagination.page, pagination.pageSize)}>
        下一页
      </PaginationLink>
    </nav>
  );
}

function PaginationLink({ children, disabled, href }: { children: ReactNode; disabled: boolean; href: Route }) {
  if (disabled) {
    return <span className="pixel-button pointer-events-none bg-[var(--surface-subtle)] px-4 py-2 text-[var(--muted)] opacity-70">{children}</span>;
  }

  return (
    <Link className="pixel-button bg-white px-4 py-2" href={href}>
      {children}
    </Link>
  );
}

function hiddenParams(params: PaginationQuery) {
  return Object.entries(params)
    .filter(([key, value]) => !ignoredParams.has(key) && value !== null && value !== undefined && String(value).trim() !== "")
    .map(([key, value]) => <input key={key} name={key} type="hidden" value={String(value)} />);
}

function pageHref(basePath: string, params: PaginationQuery, page: number, pageSize: number) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (ignoredParams.has(key) || value === null || value === undefined || String(value).trim() === "") {
      continue;
    }

    query.set(key, String(value));
  }

  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  return `${basePath}?${query.toString()}` as Route;
}
