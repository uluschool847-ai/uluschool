import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { LessonDetail } from "@/components/portal/schedule-display";
import { requireRole } from "@/lib/auth/session";
import {
  canJoinLesson,
  getParentScopedStudentScheduleLesson,
} from "@/lib/repositories/student-schedule-repository";

type ParentScheduleDetailPageProps = {
  params:
    | Promise<{ studentId: string; lessonId: string }>
    | { studentId: string; lessonId: string };
};

export default async function ParentScheduleDetailPage({ params }: ParentScheduleDetailPageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const resolved = await params;
  let lesson = null;

  try {
    lesson = await getParentScopedStudentScheduleLesson(
      session.uid,
      resolved.studentId,
      resolved.lessonId,
    );
  } catch {
    notFound();
  }

  if (!lesson) {
    notFound();
  }

  return (
    <LessonDetail
      lesson={lesson}
      childName={lesson.child?.fullName ?? lesson.student?.fullName}
      joinState={canJoinLesson(lesson, new Date())}
    />
  );
}
