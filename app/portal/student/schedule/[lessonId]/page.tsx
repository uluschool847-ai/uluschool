import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { LessonDetail } from "@/components/portal/schedule-display";
import { requireRole } from "@/lib/auth/session";
import {
  canJoinLesson,
  getStudentScheduleLesson,
} from "@/lib/repositories/student-schedule-repository";

type StudentScheduleDetailPageProps = {
  params: Promise<{ lessonId: string }> | { lessonId: string };
};

export default async function StudentScheduleDetailPage({
  params,
}: StudentScheduleDetailPageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const resolved = await params;
  const lesson = await getStudentScheduleLesson(session.uid, resolved.lessonId);

  if (!lesson) {
    notFound();
  }

  return <LessonDetail lesson={lesson} joinState={canJoinLesson(lesson, new Date())} />;
}
