import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listReportSnapshotsForStudent } from "@/lib/repositories/report-repository";
import { UserRole } from "@prisma/client";

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveParams(searchParams: PageProps["searchParams"]) {
  return searchParams ? await searchParams : {};
}

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function formatDate(date?: Date | string | null) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).formatToParts(value);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} ${month} ${year}`;
}

function hasActiveFilters(filters: Record<string, string | undefined>) {
  return Boolean(filters.termId || filters.classGroupId || filters.search || filters.sort);
}

export default async function StudentReportsPage({ searchParams }: PageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const params = await resolveParams(searchParams);
  const filters = {
    ...(clean(params.classGroupId) ? { classGroupId: clean(params.classGroupId) } : {}),
    ...(clean(params.search) ? { search: clean(params.search) } : {}),
    ...(clean(params.sort) ? { sort: clean(params.sort) } : {}),
    ...(clean(params.termId) ? { termId: clean(params.termId) } : {}),
  };
  const reports = await listReportSnapshotsForStudent(session.uid, filters);
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
            <option value="average">Average</option>
          </select>
        </label>
        <button className="h-10 rounded-md border px-4 font-medium" type="submit">
          Apply filters
        </button>
      </form>

      {reports.length === 0 ? (
        <p>{isFiltered ? "No reports match the selected filters." : "No reports available yet."}</p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li className="rounded-lg border p-4" key={report.id}>
              <article className="space-y-2">
                <h2 className="font-semibold">
                  {report.academicTerm?.name || report.academicTermName || "Academic term"}
                </h2>
                <p>
                  Class group:{" "}
                  {report.classGroup?.name || report.classGroupName || "No class group"}
                </p>
                {formatDate(report.generatedAt) ? (
                  <p>Generated: {formatDate(report.generatedAt)}</p>
                ) : null}
                <p>Weighted term average: {String(report.weightedTermAverage ?? "No average")}</p>
                {report.teacherCommentPreview ? <p>{report.teacherCommentPreview}</p> : null}
                <p>{report.pdfAvailable ? "PDF available" : "PDF unavailable"}</p>
                <Link className="text-primary" href={report.href}>
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
