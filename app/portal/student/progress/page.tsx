import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { StudentProgressHistory } from "@/app/portal/student/components/StudentProgressHistory";
import { requireRole } from "@/lib/auth/session";
import {
  type ProgressListFilters,
  listProgressNotesForStudent,
} from "@/lib/repositories/student-progress-repository";

export const metadata: Metadata = {
  title: "Progress - Student Portal",
};

type StudentProgressPageProps = {
  searchParams?:
    | Promise<{
        performanceLevel?: string;
        search?: string;
        sort?: string;
        status?: string;
        subjectId?: string;
      }>
    | {
        performanceLevel?: string;
        search?: string;
        sort?: string;
        status?: string;
        subjectId?: string;
      };
};

const PERFORMANCE_OPTIONS = [
  { value: "", label: "All levels" },
  { value: "EXCELLENT", label: "Excellent" },
  { value: "GOOD", label: "Good" },
  { value: "STRUGGLING", label: "Struggling" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All notes" },
];

const SORT_OPTIONS = [
  { value: "recordedAtDesc", label: "Newest recorded first" },
  { value: "recordedAtAsc", label: "Oldest recorded first" },
  { value: "subject", label: "Subject" },
  { value: "performanceLevel", label: "Performance level" },
  { value: "teacher", label: "Teacher" },
];

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function buildFilters(
  params: Awaited<NonNullable<StudentProgressPageProps["searchParams"]>>,
): ProgressListFilters {
  const status = clean(params.status);
  return {
    ...(status !== "archived" && clean(params.performanceLevel)
      ? { performanceLevel: clean(params.performanceLevel) }
      : {}),
    ...(clean(params.search) ? { search: clean(params.search) } : {}),
    ...(clean(params.sort) ? { sort: clean(params.sort) } : {}),
    ...(status ? { status } : {}),
    ...(clean(params.subjectId) ? { subjectId: clean(params.subjectId) } : {}),
  };
}

function hasActiveFilters(filters: ProgressListFilters) {
  return Boolean(
    filters.performanceLevel ||
      filters.search ||
      filters.subjectId ||
      (filters.status && filters.status !== "active") ||
      (filters.sort && filters.sort !== "recordedAtDesc"),
  );
}

export default async function StudentProgressPage({ searchParams = {} }: StudentProgressPageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const resolvedParams = await searchParams;
  const filters = buildFilters(resolvedParams);
  const notes = await listProgressNotesForStudent(session.uid, filters);
  const isFiltered = hasActiveFilters(filters);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Progress</h1>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Subject
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.subjectId ?? ""}
            name="subjectId"
            placeholder="Subject id"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Performance level
          <select
            className="h-10 rounded-md border px-3"
            defaultValue={filters.performanceLevel ?? ""}
            name="performanceLevel"
          >
            {PERFORMANCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Status
          <select
            className="h-10 rounded-md border px-3"
            defaultValue={filters.status ?? "active"}
            name="status"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Search
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.search ?? ""}
            name="search"
            placeholder="Search progress"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Sort
          <select
            className="h-10 rounded-md border px-3"
            defaultValue={filters.sort ?? "recordedAtDesc"}
            name="sort"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="h-10 rounded-md border px-4 font-medium">
          Apply filters
        </button>
      </form>

      <StudentProgressHistory
        emptyMessage={
          isFiltered ? "No progress notes match the selected filters." : "No progress notes yet."
        }
        notes={notes}
      />
    </main>
  );
}
