import { UserRole } from "@prisma/client";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import {
  type ProgressPerformanceLevel,
  type ProgressStatusFilter,
  listProgressNotesForTeacher,
} from "@/lib/repositories/student-progress-repository";

type TeacherProgressPageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const performanceLevels: ProgressPerformanceLevel[] = ["EXCELLENT", "GOOD", "STRUGGLING"];

function normalizeStatus(value?: string): ProgressStatusFilter {
  return value === "archived" || value === "all" ? value : "active";
}

function normalizePerformanceLevel(value?: string) {
  return performanceLevels.includes(value as ProgressPerformanceLevel) ? value : undefined;
}

function normalizeSort(value?: string) {
  return ["recordedAtDesc", "recordedAtAsc", "studentName", "subject", "performanceLevel"].includes(
    value ?? "",
  )
    ? value
    : "recordedAtDesc";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function hasActiveFilters(filters: Record<string, string | undefined>) {
  return Boolean(
    filters.studentId ||
      filters.subjectId ||
      filters.search ||
      filters.performanceLevel ||
      (filters.status && filters.status !== "active") ||
      (filters.sort && filters.sort !== "recordedAtDesc"),
  );
}

export default async function TeacherProgressPage({ searchParams }: TeacherProgressPageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const query = searchParams ? await searchParams : {};
  const status = normalizeStatus(query.status);
  const performanceLevel = normalizePerformanceLevel(query.performanceLevel);
  const sort = normalizeSort(query.sort);
  const filters = {
    ...(query.studentId?.trim() ? { studentId: query.studentId.trim() } : {}),
    ...(query.subjectId?.trim() ? { subjectId: query.subjectId.trim() } : {}),
    status,
    ...(performanceLevel ? { performanceLevel } : {}),
    ...(query.search?.trim() ? { search: query.search.trim() } : {}),
    sort,
  };
  const notes = await listProgressNotesForTeacher(session.uid, filters);
  const filtered = hasActiveFilters({ ...query, status, sort });

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Progress</h1>
        <p className="text-sm text-muted-foreground">
          Review progress notes across your assigned students.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label htmlFor="progress-student">Student</label>
          <input
            id="progress-student"
            name="studentId"
            placeholder="Student ID"
            defaultValue={query.studentId ?? ""}
          />
        </div>

        <div>
          <label htmlFor="progress-subject">Subject</label>
          <input
            id="progress-subject"
            name="subjectId"
            placeholder="Subject ID"
            defaultValue={query.subjectId ?? ""}
          />
        </div>

        <div>
          <label htmlFor="progress-status">Status</label>
          <select id="progress-status" name="status" defaultValue={status}>
            <option value="active">Current notes</option>
            <option value="archived">History</option>
            <option value="all">All notes</option>
          </select>
        </div>

        <div>
          <label htmlFor="progress-performance">Performance Level</label>
          <select
            id="progress-performance"
            name="performanceLevel"
            defaultValue={performanceLevel ?? ""}
          >
            <option value="">All levels</option>
            <option value="EXCELLENT">Strong</option>
            <option value="GOOD">On track</option>
            <option value="STRUGGLING">Needs support</option>
          </select>
        </div>

        <div>
          <label htmlFor="progress-search">Search</label>
          <input
            id="progress-search"
            name="search"
            placeholder="Student or note"
            defaultValue={query.search ?? ""}
          />
        </div>

        <div>
          <label htmlFor="progress-sort">Sort</label>
          <select id="progress-sort" name="sort" defaultValue={sort}>
            <option value="recordedAtDesc">Newest first</option>
            <option value="recordedAtAsc">Oldest first</option>
            <option value="studentName">Student name</option>
            <option value="subject">Subject</option>
            <option value="performanceLevel">Performance level</option>
          </select>
        </div>

        <button type="submit">Apply</button>
        <Link href="/portal/teacher/progress">Clear</Link>
      </form>

      {filtered ? (
        <p className="text-sm" aria-label="Active filters">
          Filters applied.
        </p>
      ) : null}

      {notes.length === 0 ? (
        <p>
          {filtered ? "No progress notes match the selected filters." : "No progress notes yet."}
        </p>
      ) : (
        <section aria-label="Progress notes" className="space-y-3">
          {notes.map((note) => (
            <article key={note.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{note.student.name}</p>
                  <p className="text-xs text-muted-foreground">{note.student.email}</p>
                  <p className="text-sm">Subject: {note.subject?.name ?? "General"}</p>
                  <p className="text-sm">Performance: {note.performanceLevel}</p>
                  <p className="text-sm">Preview: {note.contentPreview}</p>
                  <p className="text-xs text-muted-foreground">
                    Recorded: {formatDate(note.recordedAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Updated: {formatDate(note.updatedAt)}
                  </p>
                  <p className="text-xs">Status: {note.statusLabel}</p>
                </div>
                <Link href={note.studentProgressHref ?? note.href}>Open Progress</Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
