import { UserRole } from "@prisma/client";
import Link from "next/link";

import { HomeworkList } from "@/app/portal/teacher/components/HomeworkList";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import {
  type HomeworkFilters,
  listHomeworkAssignmentsForTeacher,
} from "@/lib/repositories/homework-repository";

type SearchParams = {
  classGroupId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
  sort?: string;
  status?: string;
  subjectId?: string;
};

type AssignmentRecord = {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: Date | string | null;
  archivedAt?: Date | null;
  subject?: { name?: string | null } | null;
  scheduledClass?: {
    title?: string | null;
    classGroup?: { id?: string | null; name?: string | null } | null;
    subject?: { name?: string | null } | null;
  } | null;
  submissions?: Array<{ grade?: number | null }>;
  submissionsCount?: number;
  pendingSubmissionsCount?: number;
  gradedSubmissionsCount?: number;
};

async function resolveSearchParams(searchParams: Promise<SearchParams> | SearchParams = {}) {
  return searchParams instanceof Promise ? searchParams : Promise.resolve(searchParams);
}

function normalizeStatus(value: string | undefined): "active" | "archived" | "all" {
  return value === "archived" || value === "all" ? value : "active";
}

function normalizeSort(value: string | undefined): HomeworkFilters["sort"] | undefined {
  return value === "dueDateAsc" ||
    value === "dueDateDesc" ||
    value === "title" ||
    value === "classGroup" ||
    value === "pendingSubmissions"
    ? value
    : undefined;
}

function normalizeDateFilter(value: string | undefined) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

function mapAssignment(assignment: AssignmentRecord) {
  const submissions = assignment.submissions ?? [];
  const submissionsCount = assignment.submissionsCount ?? submissions.length;
  const pendingSubmissionsCount =
    assignment.pendingSubmissionsCount ??
    submissions.filter((submission) => submission.grade === null).length;
  const gradedSubmissionsCount =
    assignment.gradedSubmissionsCount ??
    submissions.filter((submission) => submission.grade !== null).length;
  const classGroup = assignment.scheduledClass?.classGroup;

  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? "",
    dueDate:
      assignment.dueDate instanceof Date
        ? assignment.dueDate.toISOString()
        : String(assignment.dueDate ?? ""),
    className: classGroup?.name ?? assignment.scheduledClass?.title ?? "Class",
    classGroupName: classGroup?.name ?? null,
    subjectName: assignment.subject?.name ?? assignment.scheduledClass?.subject?.name ?? null,
    submissionsCount,
    pendingSubmissionsCount,
    gradedSubmissionsCount,
    archivedAt: assignment.archivedAt ?? null,
    editHref: `/portal/teacher/assignments/${assignment.id}/edit`,
    submissionsHref: null,
  };
}

export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveSearchParams(searchParams);
  const status = normalizeStatus(params.status);
  const dueDateFrom = normalizeDateFilter(params.dueDateFrom);
  const dueDateTo = normalizeDateFilter(params.dueDateTo);
  const sort = normalizeSort(params.sort);
  const filters = {
    classGroupId: params.classGroupId,
    search: params.search,
    status,
    subjectId: params.subjectId,
    ...(dueDateFrom ? { dueDateFrom } : {}),
    ...(dueDateTo ? { dueDateTo } : {}),
    ...(sort ? { sort } : {}),
  };
  const assignments = await listHomeworkAssignmentsForTeacher(session.uid, filters);
  const visibleAssignments =
    status === "active" ? assignments.filter((assignment) => !assignment.archivedAt) : assignments;
  const mappedAssignments = visibleAssignments.map((assignment) =>
    mapAssignment(assignment as AssignmentRecord),
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Homework Assignments</h1>
          <p className="mt-2 text-muted-foreground">Create and manage homework for your classes.</p>
        </div>
        <Button asChild>
          <Link href="/portal/teacher/assignments/new">Create homework</Link>
        </Button>
      </div>

      <form className="grid gap-3 rounded-lg border border-secondary p-4 md:grid-cols-4 lg:grid-cols-8">
        <label className="grid gap-1 text-sm">
          Search
          <input name="search" defaultValue={params.search ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Class group
          <input name="classGroupId" defaultValue={params.classGroupId ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Subject
          <input name="subjectId" defaultValue={params.subjectId ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Due date from
          <input name="dueDateFrom" type="date" defaultValue={dueDateFrom ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Due date to
          <input name="dueDateTo" type="date" defaultValue={dueDateTo ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          Sort
          <select name="sort" defaultValue={sort ?? "dueDateAsc"}>
            <option value="dueDateAsc">Due date ascending</option>
            <option value="dueDateDesc">Due date descending</option>
            <option value="title">Title</option>
            <option value="classGroup">Class group</option>
            <option value="pendingSubmissions">Pending submissions</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {mappedAssignments.length === 0 ? (
        <p>No homework assignments found.</p>
      ) : (
        <HomeworkList assignments={mappedAssignments} status={status} />
      )}
    </main>
  );
}
