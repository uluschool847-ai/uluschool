import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { ParentMaterialList } from "@/app/portal/parent/components/ParentMaterialList";
import { requireRole } from "@/lib/auth/session";
import {
  type ParentMaterialFilters,
  listMaterialsForParentChild,
} from "@/lib/repositories/parent-material-repository";

export const metadata: Metadata = {
  title: "Child Materials - Parent Portal",
};

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const SORT_OPTIONS = [
  { value: "createdAtDesc", label: "Newest first" },
  { value: "createdAtAsc", label: "Oldest first" },
  { value: "title", label: "Title" },
  { value: "classGroup", label: "Group" },
];

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function cleanId(value: string | undefined) {
  const trimmed = clean(value);
  return trimmed && /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : undefined;
}

function buildFilters(params: Record<string, string | undefined>): ParentMaterialFilters {
  return {
    ...(cleanId(params.classGroupId) ? { classGroupId: cleanId(params.classGroupId) } : {}),
    ...(cleanId(params.scheduledClassId)
      ? { scheduledClassId: cleanId(params.scheduledClassId) }
      : {}),
    ...(clean(params.search) ? { search: clean(params.search) } : {}),
    ...(clean(params.sort) ? { sort: clean(params.sort) } : {}),
    ...(cleanId(params.subjectId) ? { subjectId: cleanId(params.subjectId) } : {}),
  };
}

function hasActiveFilters(filters: ParentMaterialFilters) {
  return Boolean(
    filters.classGroupId ||
      filters.scheduledClassId ||
      filters.search ||
      filters.subjectId ||
      (filters.sort && filters.sort !== "createdAtDesc"),
  );
}

export default async function ParentMaterialsPage({ params, searchParams = {} }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await params;
  const query = await searchParams;
  const filters = buildFilters(query);
  const materials = await listMaterialsForParentChild(session.uid, studentId, filters);
  const isFiltered = hasActiveFilters(filters);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link className="text-sm font-medium text-primary underline" href="/portal/parent">
          Back to parent dashboard
        </Link>
        <h1 className="text-3xl font-bold">Materials</h1>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3">
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
          Subject
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.subjectId ?? ""}
            name="subjectId"
            placeholder="Subject id"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Search
          <input
            className="h-10 rounded-md border px-3"
            defaultValue={filters.search ?? ""}
            name="search"
            placeholder="Search materials"
          />
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Sort
          <select
            className="h-10 rounded-md border px-3"
            defaultValue={filters.sort ?? "createdAtDesc"}
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

      <ParentMaterialList
        emptyMessage={
          isFiltered ? "No materials match the selected filters." : "No materials available yet."
        }
        materials={materials}
        studentId={studentId}
      />
    </main>
  );
}
