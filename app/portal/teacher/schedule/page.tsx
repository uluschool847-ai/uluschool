import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import {
  ActiveFilterSummary,
  TeacherLessonCard,
  TeacherScheduleFilters,
  formatNairobiDate,
  getDateRange,
} from "@/components/portal/teacher-schedule-display";
import { requireRole } from "@/lib/auth/session";
import { parseLessonStatus } from "@/lib/lessons/lesson-status";
import {
  canStartLesson,
  getTeacherScheduleFilterOptions,
  listTeacherSchedule,
} from "@/lib/repositories/teacher-schedule-repository";

export const metadata: Metadata = {
  title: "Teacher Schedule",
};

type TeacherSchedulePageProps = {
  searchParams?: Promise<{
    from?: string;
    to?: string;
    classGroupId?: string;
    subjectId?: string;
    status?: string;
  }>;
};

export default async function TeacherSchedulePage({ searchParams }: TeacherSchedulePageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const resolved = searchParams ? await searchParams : {};
  const range = getDateRange(resolved.from, resolved.to);
  const classGroupId = resolved.classGroupId?.trim() || undefined;
  const subjectId = resolved.subjectId?.trim() || undefined;
  const requestedStatus = resolved.status?.trim() || undefined;
  const status = parseLessonStatus(requestedStatus) ?? undefined;
  const options = await getTeacherScheduleFilterOptions(session.uid);

  const lessons = await listTeacherSchedule({
    teacherId: session.uid,
    from: range.from,
    to: range.to,
    classGroupId,
    subjectId,
    status,
  });

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Teacher Schedule</h1>
            <p className="text-sm text-muted-foreground">
              Lessons from {formatNairobiDate(range.from)} to {formatNairobiDate(range.to)}.
            </p>
          </div>
          <Link
            href="/portal/teacher/availability"
            className="rounded-md border px-3 py-2 text-sm font-medium"
          >
            Availability
          </Link>
        </div>
      </header>

      <TeacherScheduleFilters
        from={range.fromValue}
        to={range.toValue}
        classGroupId={classGroupId}
        subjectId={subjectId}
        status={status}
        options={options}
        messages={range.messages}
      />

      {classGroupId || subjectId || status || resolved.from || resolved.to ? (
        <ActiveFilterSummary
          from={range.fromValue}
          to={range.toValue}
          classGroupId={classGroupId}
          subjectId={subjectId}
          status={status}
          options={options}
        />
      ) : null}

      {lessons.length === 0 ? (
        <output className="rounded-lg border p-6">
          {classGroupId || subjectId || status || resolved.from || resolved.to
            ? "No lessons match the selected filters."
            : "No lessons scheduled."}
        </output>
      ) : (
        <section className="grid gap-4" aria-label="Teacher lessons">
          {lessons.map((lesson) => (
            <TeacherLessonCard
              key={lesson.id}
              lesson={lesson}
              startState={canStartLesson(lesson, new Date())}
              detailHref={`/portal/teacher/lessons/${lesson.id}`}
            />
          ))}
        </section>
      )}
    </main>
  );
}
