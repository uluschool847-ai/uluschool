import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { LessonCard, ScheduleFilters, getMonthRange } from "@/components/portal/schedule-display";
import { requireRole } from "@/lib/auth/session";
import { parseLessonStatus } from "@/lib/lessons/lesson-status";
import { canJoinLesson, listStudentSchedule } from "@/lib/repositories/student-schedule-repository";

export const metadata: Metadata = {
  title: "Student Schedule",
};

type StudentSchedulePageProps = {
  searchParams?: Promise<{
    month?: string;
    subjectId?: string;
    status?: string;
  }>;
};

export default async function StudentSchedulePage({ searchParams }: StudentSchedulePageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const resolved = searchParams ? await searchParams : {};
  const monthRange = getMonthRange(resolved.month);
  const subjectId = resolved.subjectId?.trim() || undefined;
  const status = parseLessonStatus(resolved.status?.trim()) ?? undefined;

  const lessons = await listStudentSchedule({
    studentId: session.uid,
    from: monthRange.from,
    to: monthRange.to,
    subjectId,
    status,
  });

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Student Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Lessons for {monthRange.from.toLocaleDateString()} - {monthRange.to.toLocaleDateString()}
        </p>
      </header>

      <ScheduleFilters month={monthRange.value} subjectId={subjectId} status={status} />

      {lessons.length === 0 ? (
        <output className="rounded-lg border p-6">No lessons scheduled for this period.</output>
      ) : (
        <section className="grid gap-4" aria-label="Student lessons">
          {lessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              joinState={canJoinLesson(lesson, new Date())}
              detailHref={`/portal/student/schedule/${lesson.id}`}
            />
          ))}
        </section>
      )}
    </main>
  );
}
