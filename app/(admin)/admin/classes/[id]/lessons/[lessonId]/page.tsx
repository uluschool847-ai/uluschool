import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonRowActions } from "@/components/admin/classes/LessonRowActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getLessonById } from "@/lib/repositories/lesson-repository";

export const metadata: Metadata = {
  title: "Lesson Details",
};

type LessonDetailPageProps = {
  params:
    | Promise<{ id?: string; classGroupId?: string; lessonId: string }>
    | { id?: string; classGroupId?: string; lessonId: string };
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminLessonDetailPage({ params }: LessonDetailPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const id = resolvedParams.id ?? resolvedParams.classGroupId;
  const { lessonId } = resolvedParams;
  const lesson = await getLessonById(lessonId);

  if (!lesson || lesson.classGroupId !== id) {
    notFound();
  }

  const canJoin = lesson.status !== "CANCELLED" && lesson.status !== "COMPLETED";
  const roster = lesson.classGroup?.students ?? lesson.students ?? [];

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{lesson.title}</h1>
        <p className="text-muted-foreground">{lesson.description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lesson Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Class group: {lesson.classGroup?.name ?? "Ungrouped"}</p>
          <p>Teacher: {lesson.teacher?.fullName ?? "TBA"}</p>
          <p>
            Time: {formatDateTime(lesson.startAt)} - {formatDateTime(lesson.endAt)}
          </p>
          {lesson.status !== "CANCELLED" ? <p>Status: {lesson.status}</p> : null}
          {lesson.cancelReason ? <p>Cancel reason: {lesson.cancelReason}</p> : null}
          {canJoin ? <p>{lesson.liveLessonUrl}</p> : null}
        </CardContent>
      </Card>
      <LessonRowActions
        lesson={{
          id: lesson.id,
          classGroupId: lesson.classGroupId,
          title: lesson.title,
          status: lesson.status,
          liveLessonUrl: lesson.liveLessonUrl,
        }}
        showStatus={false}
      />
      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No students enrolled.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {roster.map((student: { id: string; fullName: string; email?: string | null }) => (
                <li key={student.id}>{student.fullName}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Learning Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>{lesson.materialsCount ?? 0} materials</p>
          <p>{lesson.assignmentsCount ?? 0} assignment(s)</p>
          <p>{lesson.submissionsCount ?? 0} submissions</p>
          <p>{lesson.remindersCount ?? 0} reminders</p>
        </CardContent>
      </Card>
    </main>
  );
}
