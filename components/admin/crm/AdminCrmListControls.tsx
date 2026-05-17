"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type AdminCrmListControlsProps = {
  basePath: string;
  initialPage: number;
  initialQuery: string;
  queryParam?: string;
};

export function AdminCrmListControls({
  basePath,
  initialPage,
  initialQuery,
  queryParam = "q",
}: AdminCrmListControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [currentQuery, setCurrentQuery] = useState(initialQuery);

  function buildUrl(page: number, q: string) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set(queryParam, q);
    return `${basePath || pathname}?${params.toString()}`;
  }

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCurrentQuery(query);
    router.push(buildUrl(1, query));
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={handleSearch} className="flex gap-2">
        <label className="sr-only" htmlFor="crm-search">
          Search
        </label>
        <input
          id="crm-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm"
          placeholder="Search cases"
        />
        <button
          type="submit"
          className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
        >
          Search
        </button>
      </form>
      <button
        type="button"
        onClick={() => router.push(buildUrl(initialPage + 1, currentQuery))}
        className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-900"
      >
        Next page
      </button>
    </div>
  );
}
