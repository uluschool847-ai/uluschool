import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ParentAssignmentList } from "@/app/portal/parent/components/ParentAssignmentList";
import { requireRole } from "@/lib/auth/session";
import {
  type ParentAssignmentFilters,
  listAssignmentsForParentChild,
} from "@/lib/repositories/parent-assignment-repository";

export const metadata: Metadata = {
  title: "Child Assignments - Parent Portal",
};

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const statusOptions = ["active", "submitted", "graded", "missing", "archived", "all"] as const;
const sortOptions = ["dueDateAsc", "dueDateDesc", "title", "status"] as const;
const statusLabels: Record<(typeof statusOptions)[number], string> = {
  active: "Current work",
  submitted: "Turned in",
  graded: "Returned grade",
  missing: "Past due",
  archived: "Closed work",
  all: "Everything",
};

function asString(value: string | undefined) {
  return value?.trim() ? value.trim() : undefined;
}

function normalizeFilters(params: Record<string, string | undefined>): ParentAssignmentFilters {
  const filters: ParentAssignmentFilters = { status: asString(params.status) ?? "all" };
  const optionalFilters: Array<[keyof ParentAssignmentFilters, string | undefined]> = [
    ["classGroupId", asString(params.classGroupId)],
    ["dueFrom", asString(params.dueFrom)],
    ["dueTo", asString(params.dueTo)],
    ["scheduledClassId", asString(params.scheduledClassId)],
    ["search", asString(params.search)],
    ["sort", asString(params.sort)],
    ["subjectId", asString(params.subjectId)],
  ];

  for (const [key, value] of optionalFilters) {
    if (value) {
      filters[key] = value;
    }
  }

  return filters;
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

type DisplayAssignment = Awaited<ReturnType<typeof listAssignmentsForParentChild>>[number];

function matchesStatus(assignment: DisplayAssignment, status: string | null | undefined) {
  if (!status || status === "all") return true;
  const normalizedStatus = assignment.status.toLowerCase();

  if (status === "active") {
    return normalizedStatus === "active" || normalizedStatus === "not submitted";
  }

  return normalizedStatus === status;
}

function matchesSearch(assignment: DisplayAssignment, search: string | null | undefined) {
  if (!search) return true;
  const query = search.toLowerCase();
  const searchableText = [
    assignment.title,
    assignment.descriptionPreview,
    assignment.subject?.name,
    assignment.scheduledClass?.title,
    assignment.classGroup?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
}

function matchesDueWindow(assignment: DisplayAssignment, filters: ParentAssignmentFilters) {
  const dueTime = new Date(assignment.dueDate).getTime();
  if (Number.isNaN(dueTime)) return true;

  if (filters.dueFrom) {
    const from = new Date(filters.dueFrom).getTime();
    if (!Number.isNaN(from) && dueTime < from) return false;
  }

  if (filters.dueTo) {
    const to = new Date(filters.dueTo).getTime();
    if (!Number.isNaN(to) && dueTime > to) return false;
  }

  return true;
}

function applyDisplayFilters(assignments: DisplayAssignment[], filters: ParentAssignmentFilters) {
  return assignments.filter(
    (assignment) =>
      matchesStatus(assignment, filters.status) &&
      (!filters.subjectId || assignment.subject?.id === filters.subjectId) &&
      (!filters.classGroupId || assignment.classGroup?.id === filters.classGroupId) &&
      (!filters.scheduledClassId || assignment.scheduledClass?.id === filters.scheduledClassId) &&
      matchesSearch(assignment, filters.search) &&
      matchesDueWindow(assignment, filters),
  );
}

export default async function ParentAssignmentsPage({ params, searchParams = {} }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await params;
  const query = await searchParams;
  const filters = normalizeFilters(query);
  const assignments = await listAssignmentsForParentChild(session.uid, studentId, filters);
  const visibleAssignments = applyDisplayFilters(assignments, filters);

  return (
    <main className="space-y-6">
      <p>
        <Link className="text-sm font-medium text-primary" href="/portal/parent">
          Back to parent dashboard
        </Link>
      </p>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Assignments</h1>
        <p className="text-sm text-muted-foreground">
          Review linked child homework, submissions, grades, and feedback.
        </p>
      </div>

      <form className="grid gap-4 rounded-lg border p-4 md:grid-cols-4" method="get">
        <Field id="parent-assignment-status" label="Status">
          <select
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.status ?? "all"}
            id="parent-assignment-status"
            name="status"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="parent-assignment-subject" label="Subject">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.subjectId ?? ""}
            id="parent-assignment-subject"
            name="subjectId"
          />
        </Field>
        <Field id="parent-assignment-class-group" label="Class Group">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.classGroupId ?? ""}
            id="parent-assignment-class-group"
            name="classGroupId"
          />
        </Field>
        <Field id="parent-assignment-scheduled-class" label="Scheduled Class">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.scheduledClassId ?? ""}
            id="parent-assignment-scheduled-class"
            name="scheduledClassId"
          />
        </Field>
        <Field id="parent-assignment-search" label="Search">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.search ?? ""}
            id="parent-assignment-search"
            name="search"
          />
        </Field>
        <Field id="parent-assignment-due-from" label="Due From">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.dueFrom ?? ""}
            id="parent-assignment-due-from"
            name="dueFrom"
            type="date"
          />
        </Field>
        <Field id="parent-assignment-due-to" label="Due To">
          <input
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.dueTo ?? ""}
            id="parent-assignment-due-to"
            name="dueTo"
            type="date"
          />
        </Field>
        <Field id="parent-assignment-sort" label="Sort">
          <select
            className="w-full rounded-md border px-3 py-2"
            defaultValue={filters.sort ?? ""}
            id="parent-assignment-sort"
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

      <ParentAssignmentList assignments={visibleAssignments} studentId={studentId} />
    </main>
  );
}
