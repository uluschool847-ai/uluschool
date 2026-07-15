import { type LessonStatus, UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { LessonRowActions } from "@/components/admin/classes/LessonRowActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { listAdminLessons } from "@/lib/repositories/lesson-repository";
import { DEFAULT_AVAILABILITY_TIMEZONE, localDateTimeToUtc } from "@/lib/scheduling/availability";

export const metadata: Metadata = {
  title: "Class Group Lessons",
};

type LessonsPageProps = {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

function asDateStart(value?: string) {
  return value
    ? localDateTimeToUtc({
        value: `${value}T00:00:00`,
        timezone: DEFAULT_AVAILABILITY_TIMEZONE,
      })
    : undefined;
}

function asDateEnd(value?: string) {
  if (!value) return undefined;
  const end = localDateTimeToUtc({
    value: `${value}T23:59:59`,
    timezone: DEFAULT_AVAILABILITY_TIMEZONE,
  });
  return new Date(end.getTime() + 999);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_AVAILABILITY_TIMEZONE,
  }).format(value);
}

export default async function AdminClassGroupLessonsPage({
  params,
  searchParams,
}: LessonsPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const routeClassGroupId =
    "classGroupId" in resolvedParams
      ? (resolvedParams as { classGroupId?: string }).classGroupId
      : resolvedParams.id;
  const classGroupId = resolvedSearchParams.classGroupId ?? routeClassGroupId ?? resolvedParams.id;

  const lessons = await listAdminLessons({
    teacherId: resolvedSearchParams.teacherId || undefined,
    classGroupId,
    subjectId: resolvedSearchParams.subjectId || undefined,
    status: (resolvedSearchParams.status || undefined) as LessonStatus | undefined,
    from: asDateStart(resolvedSearchParams.from),
    to: asDateEnd(resolvedSearchParams.to),
  });
  const seenGroups = new Set<string>();
  const seenTeachers = new Set<string>();
  const seenSubjects = new Set<string>();

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lessons</h1>
          <p className="text-muted-foreground">Calendar entries for this class group.</p>
        </div>
        <Button asChild>
          <Link href={`/admin/classes/${classGroupId}/lessons/new`}>Create Lesson</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-6">
            <input type="hidden" name="classGroupId" value={classGroupId} />
            <label className="block text-sm font-medium">
              Teacher
              <input name="teacherId" className="mt-1 h-11 w-full rounded-md border px-3" />
            </label>
            <label className="block text-sm font-medium">
              Class group
              <input
                name="classGroupId"
                defaultValue={classGroupId}
                className="mt-1 h-11 w-full rounded-md border px-3"
              />
            </label>
            <label className="block text-sm font-medium">
              Subject
              <input name="subjectId" className="mt-1 h-11 w-full rounded-md border px-3" />
            </label>
            <label className="block text-sm font-medium">
              Status
              <input name="status" className="mt-1 h-11 w-full rounded-md border px-3" />
            </label>
            <label className="block text-sm font-medium">
              From
              <input name="from" type="date" className="mt-1 h-11 w-full rounded-md border px-3" />
            </label>
            <label className="block text-sm font-medium">
              To
              <input name="to" type="date" className="mt-1 h-11 w-full rounded-md border px-3" />
            </label>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Table</CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lessons scheduled.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Class group</th>
                    <th className="py-2 pr-3">Teacher</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Start / End</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Live URL</th>
                    <th className="py-2 pr-3">Reminders</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((lesson) => {
                    const groupName = lesson.classGroup?.name ?? "Ungrouped";
                    const teacherName = lesson.teacher?.fullName ?? "TBA";
                    const subjectName = lesson.subject?.name ?? "General";
                    const showGroup = !seenGroups.has(groupName);
                    const showTeacher = !seenTeachers.has(teacherName);
                    const showSubject = !seenSubjects.has(subjectName);
                    seenGroups.add(groupName);
                    seenTeachers.add(teacherName);
                    seenSubjects.add(subjectName);

                    return (
                      <tr key={lesson.id} className="border-b align-top">
                        <td className="py-3 pr-3 font-medium">
                          <Link href={`/admin/classes/${lesson.classGroupId}/lessons/${lesson.id}`}>
                            {lesson.title}
                          </Link>
                        </td>
                        <td className="py-3 pr-3">{showGroup ? groupName : "Same group"}</td>
                        <td className="py-3 pr-3">{showTeacher ? teacherName : "Same teacher"}</td>
                        <td className="py-3 pr-3">{showSubject ? subjectName : "Same subject"}</td>
                        <td className="py-3 pr-3">
                          {formatDateTime(lesson.startAt)} - {formatDateTime(lesson.endAt)}
                        </td>
                        <td className="py-3 pr-3">
                          {lesson.status === "CANCELLED" ? "Canceled state" : lesson.status}
                        </td>
                        <td className="py-3 pr-3">
                          {lesson.status === "CANCELLED"
                            ? "Hidden for canceled lesson"
                            : lesson.liveLessonUrl}
                        </td>
                        <td className="py-3 pr-3">{lesson.remindersCount} reminders</td>
                        <td className="py-3 pr-3">
                          <LessonRowActions
                            showStatus={false}
                            lesson={{
                              id: lesson.id,
                              classGroupId: lesson.classGroupId ?? classGroupId,
                              title: lesson.title,
                              status: lesson.status,
                              startAt: lesson.startAt,
                              endAt: lesson.endAt,
                              liveLessonUrl: lesson.liveLessonUrl,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
