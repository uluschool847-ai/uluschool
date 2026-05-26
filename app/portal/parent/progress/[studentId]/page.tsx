import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import ParentProgressHistory from "@/app/portal/parent/components/ParentProgressHistory";
import { requireRole } from "@/lib/auth/session";
import {
  type ParentProgressFilters,
  listProgressNotesForParentChild,
} from "@/lib/repositories/parent-progress-repository";

export const metadata: Metadata = {
  title: "Child Progress - Parent Portal",
};

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const PERFORMANCE_OPTIONS = [
  { value: "", label: "All levels" },
  { value: "EXCELLENT", label: "Excellent" },
  { value: "GOOD", label: "Good" },
  { value: "STRUGGLING", label: "Struggling" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Past notes" },
  { value: "all", label: "All notes" },
];

const SORT_OPTIONS = [
  { value: "recordedAtDesc", label: "Newest recorded first" },
  { value: "recordedAtAsc", label: "Oldest recorded first" },
  { value: "subject", label: "Subject" },
  { value: "performanceLevel", label: "Performance level" },
];

const PERFORMANCE_VALUES = new Set(PERFORMANCE_OPTIONS.map((option) => option.value));
const STATUS_VALUES = new Set(STATUS_OPTIONS.map((option) => option.value));
const SORT_VALUES = new Set(SORT_OPTIONS.map((option) => option.value));

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function cleanId(value: string | undefined) {
  const trimmed = clean(value);
  return trimmed && /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : undefined;
}

function buildFilters(params: Record<string, string | undefined>): ParentProgressFilters {
  const performanceLevel = clean(params.performanceLevel);
  const sort = clean(params.sort);
  const status = clean(params.status);

  return {
    ...(performanceLevel && PERFORMANCE_VALUES.has(performanceLevel) ? { performanceLevel } : {}),
    ...(clean(params.search) ? { search: clean(params.search) } : {}),
    ...(sort && SORT_VALUES.has(sort) ? { sort } : {}),
    ...(status && STATUS_VALUES.has(status) ? { status } : { status: "active" }),
    ...(cleanId(params.subjectId) ? { subjectId: cleanId(params.subjectId) } : {}),
  };
}

function hasActiveFilters(filters: ParentProgressFilters) {
  return Boolean(
    filters.performanceLevel ||
      filters.search ||
      filters.subjectId ||
      (filters.status && filters.status !== "active") ||
      (filters.sort && filters.sort !== "recordedAtDesc"),
  );
}

export default async function ParentProgressPage({ params, searchParams = {} }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await params;
  const query = await searchParams;
  const filters = buildFilters(query);
  const notes = await listProgressNotesForParentChild(session.uid, studentId, filters);
  const isFiltered = hasActiveFilters(filters);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link className="text-sm font-medium text-primary underline" href="/portal/parent">
          Back to parent dashboard
        </Link>
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

      <ParentProgressHistory
        emptyMessage={
          isFiltered ? "No progress notes match the selected filters." : "No progress notes yet."
        }
        notes={notes}
        studentId={studentId}
      />
    </main>
  );
}
