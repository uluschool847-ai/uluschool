import { ClassGroupStatus, UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { deleteClassGroupAction } from "@/app/(admin)/admin/classes/actions";
import { ConfirmedSubmit } from "@/components/admin/ConfirmedSubmit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { listAdminClassGroups } from "@/lib/repositories/class-group-repository";

export const metadata: Metadata = {
  title: "Admin Class Groups",
  description: "Manage academic class groups and their lesson schedules.",
};

type AdminClassGroupsPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    teacherId?: string;
    subjectId?: string;
    levelId?: string;
    classMessage?: string;
    classError?: string;
  }>;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function parseStatus(value?: string) {
  return value && Object.values(ClassGroupStatus).includes(value as ClassGroupStatus)
    ? (value as ClassGroupStatus)
    : undefined;
}

export default async function AdminClassGroupsPage({
  searchParams,
}: AdminClassGroupsPageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const resolved = searchParams ? await searchParams : {};
  const groups = await listAdminClassGroups({
    searchQuery: resolved.q?.trim(),
    status: parseStatus(resolved.status),
    teacherId: resolved.teacherId || undefined,
    subjectId: resolved.subjectId || undefined,
    levelId: resolved.levelId || undefined,
  });

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Class Groups</h1>
          <p className="text-muted-foreground">Manage learning groups and their lesson plans.</p>
        </div>
        <Button asChild>
          <Link href="/admin/classes/new">Create Class Group</Link>
        </Button>
      </div>

      {resolved.classMessage ? (
        <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {resolved.classMessage}
        </p>
      ) : null}
      {resolved.classError ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {resolved.classError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 md:grid-cols-5">
            <label className="space-y-1 text-sm font-medium">
              <span>Search</span>
              <input
                name="q"
                defaultValue={resolved.q ?? ""}
                className="h-10 w-full rounded-md border border-input bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Status</span>
              <select
                name="status"
                defaultValue={resolved.status ?? ""}
                className="h-10 w-full rounded-md border border-input bg-background px-3"
              >
                <option value="">All statuses</option>
                <option value={ClassGroupStatus.ACTIVE}>Running</option>
                <option value={ClassGroupStatus.PAUSED}>Paused</option>
                <option value={ClassGroupStatus.ARCHIVED}>Archived</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Teacher</span>
              <input
                name="teacherId"
                defaultValue={resolved.teacherId ?? ""}
                className="h-10 w-full rounded-md border border-input bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Subject</span>
              <input
                name="subjectId"
                defaultValue={resolved.subjectId ?? ""}
                className="h-10 w-full rounded-md border border-input bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Level</span>
              <input
                name="levelId"
                defaultValue={resolved.levelId ?? ""}
                className="h-10 w-full rounded-md border border-input bg-background px-3"
              />
            </label>
            <div className="md:col-span-5">
              <Button type="submit" variant="secondary">
                Apply Filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Records</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-sm text-muted-foreground">
              No class groups yet. Create the first class group to start scheduling lessons.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Group</th>
                    <th className="py-2 pr-4">Subject</th>
                    <th className="py-2 pr-4">Level</th>
                    <th className="py-2 pr-4">Teacher</th>
                    <th className="py-2 pr-4">Students</th>
                    <th className="py-2 pr-4">Lessons</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Updated</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td className="py-3 pr-4">
                        <div className="font-medium">{group.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Created {formatDate(group.createdAt)}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{group.subject?.name ?? "General"}</td>
                      <td className="py-3 pr-4">{group.level?.name ?? "Any level"}</td>
                      <td className="py-3 pr-4">{group.teacher?.fullName ?? "Unassigned"}</td>
                      <td className="py-3 pr-4">
                        {group.studentsCount} / {group.capacity ?? "No limit"}
                      </td>
                      <td className="py-3 pr-4">{group.upcomingLessonsCount} upcoming</td>
                      <td className="py-3 pr-4">{group.status.toLowerCase()}</td>
                      <td className="py-3 pr-4">{formatDate(group.updatedAt)}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="secondary" size="sm">
                            <Link href={`/admin/classes/${group.id}`}>View</Link>
                          </Button>
                          <Button asChild variant="secondary" size="sm">
                            <Link href={`/admin/classes/${group.id}/edit`}>Edit</Link>
                          </Button>
                          <ConfirmedSubmit
                            title="Delete class group"
                            description={`Delete ${group.name}? This will only succeed if no lessons or student enrollments depend on this class group.`}
                            confirmLabel="Confirm delete"
                          >
                            <form
                              action={
                                deleteClassGroupAction as unknown as (formData: FormData) => void
                              }
                            >
                              <input type="hidden" name="flash" value="true" />
                              <input type="hidden" name="id" value={group.id} />
                              <input type="hidden" name="successRedirect" value="/admin/classes" />
                              <input type="hidden" name="errorRedirect" value="/admin/classes" />
                              <Button type="submit" variant="destructive" size="sm">
                                Delete
                              </Button>
                            </form>
                          </ConfirmedSubmit>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
