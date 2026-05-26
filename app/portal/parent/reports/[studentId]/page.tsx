import { UserRole } from "@prisma/client";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listReportSnapshotsForParentChild } from "@/lib/repositories/report-repository";

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const SORT_OPTIONS = new Set(["generatedAtDesc", "generatedAtAsc", "term", "classGroup"]);

async function resolveParams<T>(params: Promise<T> | T) {
  return await params;
}

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function buildFilters(params: Record<string, string | undefined>) {
  const sort = clean(params.sort);

  return {
    ...(clean(params.classGroupId) ? { classGroupId: clean(params.classGroupId) } : {}),
    ...(clean(params.search) ? { search: clean(params.search) } : {}),
    ...(sort && SORT_OPTIONS.has(sort) ? { sort } : {}),
    ...(clean(params.termId) ? { termId: clean(params.termId) } : {}),
  };
}

function hasActiveFilters(filters: ReturnType<typeof buildFilters>) {
  return Boolean(
    filters.termId ||
      filters.classGroupId ||
      filters.search ||
      (filters.sort && filters.sort !== "generatedAtDesc"),
  );
}

function formatDate(date?: Date | string | null) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}

export default async function ParentReportsPage({ params, searchParams = {} }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await resolveParams(params);
  const query = await searchParams;
  const filters = buildFilters(query);
  const reports = await listReportSnapshotsForParentChild(session.uid, studentId, filters);
  const isFiltered = hasActiveFilters(filters);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
      </header>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm font-medium">
          Term
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.termId ?? ""}
            name="termId"
            placeholder="Term id"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Class group
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.classGroupId ?? ""}
            name="classGroupId"
            placeholder="Class group id"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Search
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.search ?? ""}
            name="search"
            placeholder="Search reports"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Sort
          <select
            className="h-10 rounded-md border px-3"
            defaultValue={filters.sort ?? "generatedAtDesc"}
            name="sort"
          >
            <option value="generatedAtDesc">Newest generated first</option>
            <option value="generatedAtAsc">Oldest generated first</option>
            <option value="term">Term</option>
            <option value="classGroup">Class group</option>
          </select>
        </label>
        <button className="h-10 rounded-md border px-4 font-medium" type="submit">
          Apply filters
        </button>
      </form>

      {reports.length === 0 ? (
        <p>
          {isFiltered
            ? "No reports match the selected filters."
            : "No reports available for this student."}
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li className="rounded-lg border p-4" key={report.id}>
              <article aria-label={report.academicTermName || "Report"} className="space-y-2">
                <h2 className="font-semibold">{report.academicTermName || "Academic term"}</h2>
                <p>{report.childName}</p>
                <p>Class group: {report.classGroupName || "No class group"}</p>
                {formatDate(report.generatedAt) ? (
                  <p>Generated: {formatDate(report.generatedAt)}</p>
                ) : null}
                <p>Weighted average: {String(report.weightedTermAverage ?? "No average")}</p>
                {report.teacherCommentPreview ? <p>{report.teacherCommentPreview}</p> : null}
                <p>{report.pdfAvailable ? "PDF available" : "PDF unavailable"}</p>
                <Link className="text-primary underline" href={report.href}>
                  View report
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
