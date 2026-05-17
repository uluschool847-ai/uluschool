import { ClassGroupStatus, UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireRole } from "@/lib/auth/session";
import {
  type TeacherClassGroupFilters,
  listTeacherClassGroups,
} from "@/lib/repositories/teacher-classes-repository";

export const metadata: Metadata = {
  title: "Teacher Classes - mathSchool",
};

type SearchParams = {
  levelId?: string;
  q?: string;
  sort?: string;
  status?: string;
  subjectId?: string;
};

const sortOptions = [
  { label: "Name", value: "name" },
  { label: "Next lesson", value: "nextLesson" },
  { label: "Pending submissions", value: "pendingSubmissions" },
  { label: "Roster size", value: "rosterSize" },
];

function normalizeFilters(params: SearchParams): TeacherClassGroupFilters {
  const status =
    params.status && Object.values(ClassGroupStatus).includes(params.status as ClassGroupStatus)
      ? (params.status as ClassGroupStatus)
      : undefined;
  const sort = sortOptions.some((option) => option.value === params.sort)
    ? (params.sort as TeacherClassGroupFilters["sort"])
    : undefined;

  return {
    ...(params.q ? { q: params.q } : {}),
    ...(status ? { status } : {}),
    ...(params.subjectId ? { subjectId: params.subjectId } : {}),
    ...(params.levelId ? { levelId: params.levelId } : {}),
    ...(sort ? { sort } : {}),
  };
}

function formatDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    timeZone: "Europe/Kiev",
  }).formatToParts(date);

  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return `${day} ${month} ${year}`;
}

function EmptyState() {
  return (
    <p className="rounded-lg border border-dashed border-secondary bg-secondary/20 p-4 text-sm text-muted-foreground">
      No classes assigned
    </p>
  );
}

export default async function TeacherClassesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const resolvedParams = (await searchParams) ?? {};
  const filters = normalizeFilters(resolvedParams);
  const classes = await listTeacherClassGroups(session.uid, filters);

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Classes</h1>
        <p className="mt-2 text-muted-foreground">Read-only class groups assigned to you.</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-heading text-xl font-semibold">Filters</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-5">
            <label htmlFor="teacher-classes-search" className="grid gap-1 text-sm">
              <span>Search classes</span>
              <Input
                id="teacher-classes-search"
                name="q"
                defaultValue={resolvedParams.q ?? ""}
                placeholder="Search classes"
              />
            </label>
            <label htmlFor="teacher-classes-status" className="grid gap-1 text-sm">
              <span>Status</span>
              <select
                id="teacher-classes-status"
                name="status"
                defaultValue={resolvedParams.status ?? ""}
                className="min-h-12 rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="">All statuses</option>
                {Object.values(ClassGroupStatus).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="teacher-classes-subject" className="grid gap-1 text-sm">
              <span>Subject</span>
              <Input
                id="teacher-classes-subject"
                name="subjectId"
                defaultValue={resolvedParams.subjectId ?? ""}
                placeholder="subjectId"
              />
            </label>
            <label htmlFor="teacher-classes-level" className="grid gap-1 text-sm">
              <span>Level</span>
              <Input
                id="teacher-classes-level"
                name="levelId"
                defaultValue={resolvedParams.levelId ?? ""}
                placeholder="levelId"
              />
            </label>
            <label htmlFor="teacher-classes-sort" className="grid gap-1 text-sm">
              <span>Sort</span>
              <select
                id="teacher-classes-sort"
                name="sort"
                defaultValue={resolvedParams.sort ?? "name"}
                className="min-h-12 rounded-md border border-input bg-background px-3 py-2"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" className="md:col-span-5">
              Apply Filters
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-label="Teacher classes">
        {classes.length === 0 ? (
          <EmptyState />
        ) : (
          classes.map((classGroup) => (
            <article key={classGroup.id} className="rounded-lg border border-secondary p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium">{classGroup.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Subject: {classGroup.subject?.name ?? "General"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Level: {classGroup.level?.name ?? "Unassigned"}
                  </p>
                  <p className="text-xs text-muted-foreground">Status: {classGroup.status}</p>
                  <p className="text-xs text-muted-foreground">
                    Capacity: {classGroup.capacity ?? "Not set"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {classGroup.activeRosterCount} active / {classGroup.rosterCount} total
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Upcoming lessons: {classGroup.upcomingLessonsCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Active assignments: {classGroup.activeAssignmentsCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pending submissions: {classGroup.pendingSubmissionsCount}
                  </p>
                  {classGroup.nextLesson ? (
                    <p className="text-xs text-muted-foreground">
                      Next lesson: {classGroup.nextLesson.title} on{" "}
                      {formatDate(classGroup.nextLesson.startAt)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No upcoming lesson scheduled</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={classGroup.openHref}>View Class - {classGroup.name}</Link>
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={classGroup.scheduleHref}>Schedule - {classGroup.name}</Link>
                  </Button>
                  {classGroup.nextLesson && classGroup.nextLessonHref ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link
                        href={classGroup.nextLessonHref}
                        aria-label={`Open Lesson - ${classGroup.nextLesson.title}`}
                      >
                        Open Lesson
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
