import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { SubmissionList } from "@/app/portal/teacher/components/SubmissionList";
import { requireRole } from "@/lib/auth/session";
import {
  type TeacherSubmissionFilters,
  listSubmissionsForTeacher,
} from "@/lib/repositories/submission-repository";

export const metadata: Metadata = {
  title: "Teacher Submissions - mathSchool",
};

type TeacherSubmissionsPageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const allowedStatuses = new Set(["pending", "graded", "all"]);
const allowedSorts = new Set([
  "submittedAtDesc",
  "submittedAtAsc",
  "studentName",
  "assignmentTitle",
  "status",
] as const);

type TeacherSubmissionSort = NonNullable<TeacherSubmissionFilters["sort"]>;

function isAllowedSort(value: string | undefined): value is TeacherSubmissionSort {
  return Boolean(value && allowedSorts.has(value as TeacherSubmissionSort));
}

function stringParam(value: string | undefined) {
  return value?.trim() || undefined;
}

function buildFilters(params: Record<string, string | undefined>): TeacherSubmissionFilters {
  const status = stringParam(params.status);
  const sort = stringParam(params.sort);

  return {
    ...(status && allowedStatuses.has(status) ? { status } : {}),
    ...(stringParam(params.classGroupId) ? { classGroupId: stringParam(params.classGroupId) } : {}),
    ...(stringParam(params.scheduledClassId)
      ? { scheduledClassId: stringParam(params.scheduledClassId) }
      : {}),
    ...(stringParam(params.assignmentId) ? { assignmentId: stringParam(params.assignmentId) } : {}),
    ...(stringParam(params.studentId) ? { studentId: stringParam(params.studentId) } : {}),
    ...(stringParam(params.subjectId) ? { subjectId: stringParam(params.subjectId) } : {}),
    ...(stringParam(params.search) ? { search: stringParam(params.search) } : {}),
    ...(isAllowedSort(sort) ? { sort } : {}),
  };
}

function filterSummary(filters: TeacherSubmissionFilters) {
  const parts = [
    filters.status ? `Status: ${filters.status}` : null,
    filters.classGroupId ? `Class: ${filters.classGroupId}` : null,
    filters.scheduledClassId ? `Lesson: ${filters.scheduledClassId}` : null,
    filters.assignmentId ? `Assignment: ${filters.assignmentId}` : null,
    filters.studentId ? `Student: ${filters.studentId}` : null,
    filters.subjectId ? `Subject: ${filters.subjectId}` : null,
    filters.search ? "Search applied" : null,
    filters.sort ? `Sort: ${filters.sort}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("; ") : "All teacher submissions";
}

export default async function TeacherSubmissionsPage({
  searchParams = {},
}: TeacherSubmissionsPageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const resolvedSearchParams = await searchParams;
  const filters = buildFilters(resolvedSearchParams);
  const submissions = await listSubmissionsForTeacher(session.uid, filters);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Submissions</h1>
        <p className="text-muted-foreground">
          Review student homework submissions and record grades.
        </p>
      </header>

      <form className="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
        <label className="grid gap-1">
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? "all"}>
            <option value="all">All</option>
            <option value="pending">Awaiting grade</option>
            <option value="graded">Marked</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span>Class group</span>
          <input name="classGroupId" defaultValue={filters.classGroupId ?? ""} />
        </label>

        <label className="grid gap-1">
          <span>Lesson / scheduled class</span>
          <input name="scheduledClassId" defaultValue={filters.scheduledClassId ?? ""} />
        </label>

        <label className="grid gap-1">
          <span>Assignment</span>
          <input name="assignmentId" defaultValue={filters.assignmentId ?? ""} />
        </label>

        <label className="grid gap-1">
          <span>Student</span>
          <input name="studentId" defaultValue={filters.studentId ?? ""} />
        </label>

        <label className="grid gap-1">
          <span>Subject</span>
          <input name="subjectId" defaultValue={filters.subjectId ?? ""} />
        </label>

        <label className="grid gap-1">
          <span>Search</span>
          <input name="search" defaultValue={filters.search ?? ""} />
        </label>

        <label className="grid gap-1">
          <span>Sort</span>
          <select name="sort" defaultValue={filters.sort ?? "submittedAtDesc"}>
            <option value="submittedAtDesc">Newest first</option>
            <option value="submittedAtAsc">Oldest first</option>
            <option value="studentName">Student name</option>
            <option value="assignmentTitle">Assignment title</option>
            <option value="status">Submission state</option>
          </select>
        </label>

        <div className="md:col-span-4">
          <button className="rounded-md border px-3 py-2 text-sm" type="submit">
            Apply
          </button>
        </div>
      </form>

      <SubmissionList filterSummary={filterSummary(filters)} submissions={submissions} />
    </main>
  );
}
