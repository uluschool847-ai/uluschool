import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  type StudentAssignmentFilters,
  listAssignmentsForStudent,
} from "@/lib/repositories/submission-repository";

export const metadata: Metadata = {
  title: "Assignments - Student Portal",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const statusOptions = ["active", "submitted", "graded", "missing", "archived", "all"] as const;
const sortOptions = ["dueDateAsc", "dueDateDesc", "title", "status"] as const;

function asString(value: string | undefined) {
  return value?.trim() ? value.trim() : undefined;
}

function normalizeFilters(params: Record<string, string | undefined>): StudentAssignmentFilters {
  return {
    classGroupId: asString(params.classGroupId),
    dueFrom: asString(params.dueFrom),
    dueTo: asString(params.dueTo),
    scheduledClassId: asString(params.scheduledClassId),
    search: asString(params.search),
    sort: asString(params.sort),
    status: asString(params.status) ?? "active",
    subjectId: asString(params.subjectId),
  };
}

function hasActiveFilters(filters: StudentAssignmentFilters) {
  return Boolean(
    (filters.status && filters.status !== "active") ||
      filters.subjectId ||
      filters.classGroupId ||
      filters.scheduledClassId ||
      filters.search ||
      filters.dueFrom ||
      filters.dueTo ||
      filters.sort,
  );
}

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function Field({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="space-y-1 text-sm">
      <label className="block font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default async function StudentAssignmentsPage({ searchParams = {} }: PageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const params = await searchParams;
  const filters = normalizeFilters(params);
  const assignments = await listAssignmentsForStudent(session.uid, filters);
  const visibleAssignments =
    filters.status === "active"
      ? assignments.filter((assignment) => assignment.status !== "Archived")
      : assignments;

  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Assignments</h1>
        <p className="text-sm text-muted-foreground">
          Review assigned work, submissions, grades, and feedback.
        </p>
      </div>

      <form className="grid gap-4 rounded-lg border p-4 md:grid-cols-4" method="get">
        <Field id="assignment-status" label="Status">
          <select
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.status ?? "active"}
            id="assignment-status"
            name="status"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </Field>
        <Field id="assignment-subject" label="Subject">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.subjectId ?? ""}
            id="assignment-subject"
            name="subjectId"
          />
        </Field>
        <Field id="assignment-class-group" label="Class Group">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.classGroupId ?? ""}
            id="assignment-class-group"
            name="classGroupId"
          />
        </Field>
        <Field id="assignment-scheduled-class" label="Scheduled Class">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.scheduledClassId ?? ""}
            id="assignment-scheduled-class"
            name="scheduledClassId"
          />
        </Field>
        <Field id="assignment-search" label="Search">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.search ?? ""}
            id="assignment-search"
            name="search"
          />
        </Field>
        <Field id="assignment-due-from" label="Due From">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.dueFrom ?? ""}
            id="assignment-due-from"
            name="dueFrom"
            type="date"
          />
        </Field>
        <Field id="assignment-due-to" label="Due To">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.dueTo ?? ""}
            id="assignment-due-to"
            name="dueTo"
            type="date"
          />
        </Field>
        <Field id="assignment-sort" label="Sort">
          <select
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.sort ?? ""}
            id="assignment-sort"
            name="sort"
          >
            <option value="">Default</option>
            {sortOptions.map((sort) => (
              <option key={sort} value={sort}>
                {sort}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-4">
          <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" type="submit">
            Apply filters
          </button>
        </div>
      </form>

      {visibleAssignments.length === 0 ? (
        <output>
          {hasActiveFilters(filters)
            ? "No assignments match the selected filters."
            : "No assignments yet."}
        </output>
      ) : (
        <div className="space-y-4">
          {visibleAssignments.map((assignment) => (
            <article key={assignment.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">{assignment.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {assignment.descriptionPreview}
                      </p>
                    </div>
                    <span className="rounded-full border px-3 py-1 text-xs font-medium">
                      {assignment.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    Class/group: {assignment.scheduledClass.title}
                    {assignment.classGroup ? ` / ${assignment.classGroup.name}` : ""}. Subject:{" "}
                    {assignment.subject?.name ?? "Not set"}. Due: {formatDate(assignment.dueDate)}.
                  </p>
                  {assignment.status === "Graded" ? (
                    <div className="rounded-md bg-muted p-3 text-sm">
                      {assignment.grade !== null ? <p>Grade: {assignment.grade}</p> : null}
                      {assignment.feedbackPreview ? (
                        <p>Feedback: {assignment.feedbackPreview}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <Link className="font-medium text-primary" href={assignment.detailHref}>
                    View assignment
                  </Link>
                </CardContent>
              </Card>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
