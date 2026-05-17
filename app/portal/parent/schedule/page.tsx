import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { LessonCard, ScheduleFilters, getMonthRange } from "@/components/portal/schedule-display";
import { requireRole } from "@/lib/auth/session";
import { parseLessonStatus } from "@/lib/lessons/lesson-status";
import { getLinkedChildren } from "@/lib/repositories/portal-repository";
import {
  canJoinLesson,
  listParentChildSchedule,
} from "@/lib/repositories/student-schedule-repository";

export const metadata: Metadata = {
  title: "Child Schedule",
};

type ParentSchedulePageProps = {
  searchParams?: Promise<{
    month?: string;
    studentId?: string;
    subjectId?: string;
    status?: string;
  }>;
};

export default async function ParentSchedulePage({ searchParams }: ParentSchedulePageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const resolved = searchParams ? await searchParams : {};
  const children = await getLinkedChildren(session.uid);
  const monthRange = getMonthRange(resolved.month);
  const selectedChildId =
    resolved.studentId && children.some((child) => child.id === resolved.studentId)
      ? resolved.studentId
      : children[0]?.id;
  const subjectId = resolved.subjectId?.trim() || undefined;
  const status = parseLessonStatus(resolved.status?.trim()) ?? undefined;
  const childById = new Map(children.map((child) => [child.id, child]));

  const lessons =
    children.length > 0 && selectedChildId
      ? await listParentChildSchedule({
          parentId: session.uid,
          studentId: selectedChildId,
          from: monthRange.from,
          to: monthRange.to,
          subjectId,
          status,
        })
      : [];

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Child Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Lessons for {monthRange.from.toLocaleDateString()} - {monthRange.to.toLocaleDateString()}
        </p>
      </header>

      {children.length === 0 ? (
        <output className="rounded-lg border p-6">No linked children found.</output>
      ) : (
        <>
          <ScheduleFilters
            month={monthRange.value}
            subjectId={subjectId}
            status={status}
            childOptions={children}
            selectedChildId={selectedChildId}
          />

          {lessons.length === 0 ? (
            <output className="rounded-lg border p-6">
              No lessons scheduled for this child/period.
            </output>
          ) : (
            <section className="grid gap-4" aria-label="Schedule lessons">
              {lessons.map((lesson) => {
                const child =
                  lesson.child ?? lesson.student ?? childById.get(selectedChildId ?? "");
                const childId = child?.id ?? selectedChildId ?? "";
                return (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    childName={child?.fullName}
                    joinState={canJoinLesson(lesson, new Date())}
                    detailHref={`/portal/parent/schedule/${childId}/${lesson.id}`}
                  />
                );
              })}
            </section>
          )}
        </>
      )}
    </main>
  );
}
