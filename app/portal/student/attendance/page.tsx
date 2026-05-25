import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import {
  type StudentAttendanceFilters,
  listStudentAttendance,
} from "@/lib/repositories/attendance-repository";

export const metadata: Metadata = {
  title: "Attendance - Student Portal",
};

type StudentAttendancePageProps = {
  searchParams?:
    | Promise<{
        classGroupId?: string;
        from?: string;
        scheduledClassId?: string;
        search?: string;
        sort?: string;
        status?: string;
        subjectId?: string;
        to?: string;
      }>
    | {
        classGroupId?: string;
        from?: string;
        scheduledClassId?: string;
        search?: string;
        sort?: string;
        status?: string;
        subjectId?: string;
        to?: string;
      };
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

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function buildFilters(
  params: Awaited<NonNullable<StudentAttendancePageProps["searchParams"]>>,
): StudentAttendanceFilters {
  return {
    ...(clean(params.classGroupId) ? { classGroupId: clean(params.classGroupId) } : {}),
    ...(clean(params.from) ? { from: clean(params.from) } : {}),
    ...(clean(params.scheduledClassId) ? { scheduledClassId: clean(params.scheduledClassId) } : {}),
    ...(clean(params.search) ? { search: clean(params.search) } : {}),
    ...(clean(params.sort) ? { sort: clean(params.sort) } : {}),
    ...(clean(params.status) ? { status: clean(params.status) } : {}),
    ...(clean(params.subjectId) ? { subjectId: clean(params.subjectId) } : {}),
    ...(clean(params.to) ? { to: clean(params.to) } : {}),
  };
}

function hasActiveFilters(filters: StudentAttendanceFilters) {
  return Boolean(
    filters.classGroupId ||
      filters.from ||
      filters.scheduledClassId ||
      filters.search ||
      filters.subjectId ||
      filters.to ||
      (filters.status && filters.status !== "all") ||
      (filters.sort && filters.sort !== "markedAtDesc"),
  );
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not marked";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not marked";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function StudentAttendancePage({
  searchParams = {},
}: StudentAttendancePageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const resolvedParams = await searchParams;
  const filters = buildFilters(resolvedParams);
  const attendance = await listStudentAttendance(session.uid, filters);
  const isFiltered = hasActiveFilters(filters);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
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
          From
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.from ? String(filters.from) : ""}
            name="from"
            type="date"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          To
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.to ? String(filters.to) : ""}
            name="to"
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Attendance summary">
        <p className="rounded-md border p-3">Present {attendance.summary.present}</p>
        <p className="rounded-md border p-3">Late {attendance.summary.late}</p>
        <p className="rounded-md border p-3">Absent {attendance.summary.absent}</p>
        <p className="rounded-md border p-3">Total {attendance.summary.total}</p>
        {attendance.summary.attendanceRate !== null ? (
          <p className="rounded-md border p-3">
            Attendance rate {attendance.summary.attendanceRate}%
          </p>
        ) : null}
      </section>

      {attendance.records.length === 0 ? (
        <p>
          {isFiltered
            ? "No attendance records match the selected filters."
            : "No attendance records yet."}
        </p>
      ) : (
        <div className="space-y-4">
          {attendance.records.map((record) => (
            <article
              key={record.id}
              aria-label={record.lesson.title}
              className="space-y-2 rounded-md border p-4"
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{record.lesson.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    Lesson: {formatDateTime(record.lesson.startAt)}
                  </p>
                </div>
              </header>

              <div className="grid gap-1 text-sm">
                <p>
                  Subject: {record.subject?.name ?? "General"}; Group:{" "}
                  {record.classGroup?.name ?? "No class group"}
                </p>
                <p>
                  Status: {record.statusLabel}
                  {record.lateMinutes ? `; Late minutes: ${record.lateMinutes}` : ""}
                </p>
                {record.reason ? <p>Reason: {record.reason}</p> : null}
                <p>Marked: {formatDate(record.markedAt)}</p>
                <p>Lesson status: {record.lesson.status ?? "Not set"}</p>
              </div>

              <Link href={record.lesson.detailHref} className="text-sm font-medium underline">
                View lesson
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
