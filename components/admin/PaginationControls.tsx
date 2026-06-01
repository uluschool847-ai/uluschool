import Link from "next/link";

type QueryValue = string | number | boolean | null | undefined;

type PaginationControlsProps = {
  basePath: string;
  currentPage: number;
  totalPages: number;
  totalCount?: number;
  query?: Record<string, QueryValue>;
};

function buildPageHref(basePath: string, page: number, query: Record<string, QueryValue>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export function PaginationControls({
  basePath,
  currentPage,
  totalPages,
  totalCount,
  query = {},
}: PaginationControlsProps) {
  if (totalPages <= 1) {
    return null;
  }

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        Page {currentPage} of {totalPages}
        {typeof totalCount === "number" ? ` (${totalCount} total)` : ""}
      </p>
      <div className="flex items-center gap-2">
        {currentPage > 1 ? (
          <Link
            href={buildPageHref(basePath, previousPage, query)}
            className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-900"
          >
            Previous
          </Link>
        ) : null}
        {currentPage < totalPages ? (
          <Link
            href={buildPageHref(basePath, nextPage, query)}
            className="rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-900"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
