import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import ParentAttendanceHistory from "@/app/portal/parent/components/ParentAttendanceHistory";
import { requireRole } from "@/lib/auth/session";
import {
  type ParentAttendanceFilters,
  listAttendanceForParentChild,
} from "@/lib/repositories/parent-attendance-repository";

export const metadata: Metadata = {
  title: "Child Attendance - Parent Portal",
};

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "Late" },
  { value: "ABSENT", label: "Absent" },
];

const SORT_OPTIONS = [
  { value: "markedAtDesc", label: "Latest marked first" },
  { value: "markedAtAsc", label: "Oldest marked first" },
  { value: "lessonDateDesc", label: "Latest lesson first" },
  { value: "lessonDateAsc", label: "Oldest lesson first" },
  { value: "status", label: "Status" },
  { value: "subject", label: "Subject" },
];

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

function cleanDate(value: string | undefined) {
  const trimmed = clean(value);
  if (!trimmed) return undefined;
  return Number.isNaN(new Date(trimmed).getTime()) ? undefined : trimmed;
}

function buildFilters(params: Record<string, string | undefined>): ParentAttendanceFilters {
  const sort = clean(params.sort);
  const status = clean(params.status);

  return {
    ...(cleanId(params.classGroupId) ? { classGroupId: cleanId(params.classGroupId) } : {}),
    ...(cleanDate(params.dateFrom) ? { dateFrom: cleanDate(params.dateFrom) } : {}),
    ...(cleanDate(params.dateTo) ? { dateTo: cleanDate(params.dateTo) } : {}),
    ...(cleanId(params.scheduledClassId)
      ? { scheduledClassId: cleanId(params.scheduledClassId) }
      : {}),
    ...(clean(params.search) ? { search: clean(params.search) } : {}),
    ...(sort && SORT_VALUES.has(sort) ? { sort } : {}),
    ...(status && STATUS_VALUES.has(status) ? { status } : {}),
    ...(cleanId(params.subjectId) ? { subjectId: cleanId(params.subjectId) } : {}),
  };
}

function hasActiveFilters(filters: ParentAttendanceFilters) {
  return Boolean(
    filters.classGroupId ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.scheduledClassId ||
      filters.search ||
      filters.subjectId ||
      (filters.status && filters.status !== "all") ||
      (filters.sort && filters.sort !== "markedAtDesc"),
  );
}

export default async function ParentAttendancePage({ params, searchParams = {} }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await params;
  const query = await searchParams;
  const filters = buildFilters(query);
  const attendance = await listAttendanceForParentChild(session.uid, studentId, filters);
  const isFiltered = hasActiveFilters(filters);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link className="text-sm font-medium text-primary underline" href="/portal/parent">
          Back to parent dashboard
        </Link>
        <h1 className="text-3xl font-bold">Attendance</h1>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Status
          <select
            className="h-10 rounded-md border px-3"
            defaultValue={filters.status ?? "all"}
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
          Subject
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.subjectId ?? ""}
            name="subjectId"
            placeholder="Subject id"
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
          Class / lesson
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.scheduledClassId ?? ""}
            name="scheduledClassId"
            placeholder="Lesson id"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Date from
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.dateFrom ? String(filters.dateFrom) : ""}
            name="dateFrom"
            type="date"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Date to
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.dateTo ? String(filters.dateTo) : ""}
            name="dateTo"
            type="date"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Search
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.search ?? ""}
            name="search"
            placeholder="Search attendance"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Sort
          <select
            className="h-10 rounded-md border px-3"
            defaultValue={filters.sort ?? "markedAtDesc"}
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

      <ParentAttendanceHistory
        attendance={attendance}
        emptyMessage={
          isFiltered
            ? "No attendance records match the selected filters."
            : "No attendance records yet."
        }
        studentId={studentId}
      />
    </main>
  );
}
