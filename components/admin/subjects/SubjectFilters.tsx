import Link from "next/link";

import { Button } from "@/components/ui/button";

type SubjectFiltersProps = {
  searchQuery?: string;
  isActive?: boolean;
};

export function SubjectFilters({ searchQuery, isActive }: SubjectFiltersProps) {
  const activeValue = isActive === undefined ? "all" : String(isActive);

  return (
    <form className="grid gap-4 md:grid-cols-[1fr_220px_auto_auto]" action="/admin/subjects">
      <input aria-hidden="true" className="sr-only" readOnly tabIndex={-1} value={activeValue} />
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Search subjects
        <input
          name="q"
          type="search"
          defaultValue={searchQuery ?? ""}
          placeholder="biology"
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Status
        <select
          name="isActive"
          defaultValue={activeValue}
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          <option value="all">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </label>

      <div className="flex items-end">
        <Button type="submit">Apply filters</Button>
      </div>

      <div className="flex items-end">
        <Button asChild variant="outline">
          <Link href="/admin/subjects">Reset</Link>
        </Button>
      </div>
    </form>
  );
}
