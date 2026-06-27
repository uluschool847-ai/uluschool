import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getTeacherClassGroupDetail } from "@/lib/repositories/teacher-classes-repository";

export const metadata: Metadata = {
  title: "Teacher Class - mathSchool",
};

function formatDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    timeZone: "Africa/Nairobi",
  }).formatToParts(date);

  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return `${day} ${month} ${year}`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function EmptyState({ children }: { children: string }) {
  return (
    <p className="rounded-lg border border-dashed border-secondary bg-secondary/20 p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="font-heading text-xl font-semibold">{title}</h2>;
}

function LessonList({
  lessons,
  emptyLabel,
}: {
  lessons: Array<{
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    status: string;
    detailHref: string;
    startHref?: string | null;
  }>;
  emptyLabel: string;
}) {
  if (lessons.length === 0) {
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <ul className="space-y-3">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="rounded-lg border border-secondary p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">{lesson.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(lesson.startAt)} {formatTime(lesson.startAt)} -{" "}
                {formatTime(lesson.endAt)} Africa/Nairobi
              </p>
              <p className="text-xs text-muted-foreground">Status: {lesson.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {lesson.startHref ? (
                <Button asChild size="sm">
                  <a
                    href={lesson.startHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Start Lesson ${lesson.title}`}
                  >
                    Start Lesson - {lesson.title}
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <Link href={lesson.detailHref} aria-label={`Open Details ${lesson.title}`}>
                  Open Details - {lesson.title}
                </Link>
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function TeacherClassGroupPage({
  params,
}: {
  params: Promise<{ classGroupId: string }> | { classGroupId: string };
}) {
  const session = await requireRole([UserRole.TEACHER]);
  const resolvedParams = await params;
  const classGroup = await getTeacherClassGroupDetail(session.uid, resolvedParams.classGroupId);

  if (!classGroup) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/classes">Back to Classes</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/portal/teacher/schedule?classGroupId=${classGroup.id}`}>Schedule</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/portal/teacher/assignments?classGroupId=${classGroup.id}`}>
              Assignments
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/portal/teacher/submissions?classGroupId=${classGroup.id}`}>
              Submissions
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/portal/teacher/materials?classGroupId=${classGroup.id}`}>Materials</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/progress">Progress</Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{classGroup.name}</h1>
        <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <p>Subject: {classGroup.subject?.name ?? "General"}</p>
          <p>Level: {classGroup.level?.name ?? "Unassigned"}</p>
          <p>Class status {classGroup.status}</p>
          <p>Capacity: {classGroup.capacity ?? "Not set"}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <SectionHeading title="Roster" />
        </CardHeader>
        <CardContent>
          {classGroup.roster.length === 0 ? (
            <EmptyState>No students enrolled</EmptyState>
          ) : (
            <ul className="space-y-2">
              {classGroup.roster.map((student) => (
                <li key={student.id} className="rounded-lg border border-secondary p-3 text-sm">
                  <span className="font-medium">{student.fullName}</span>
                  <span className="text-muted-foreground"> - {student.email}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {student.isActive ? "Active" : "Inactive"}
                  </span>
                  {student.learningStatus ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Learning status: {student.learningStatus}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionHeading title="Upcoming Lessons" />
          </CardHeader>
          <CardContent>
            <LessonList lessons={classGroup.upcomingLessons} emptyLabel="No upcoming lessons" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading title="Past Lessons" />
          </CardHeader>
          <CardContent>
            <LessonList lessons={classGroup.pastLessons} emptyLabel="No past lessons" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionHeading title="Assignments" />
          </CardHeader>
          <CardContent>
            {classGroup.assignments.length === 0 ? (
              <EmptyState>No assignments</EmptyState>
            ) : (
              <ul className="space-y-3">
                {classGroup.assignments.map((assignment) => (
                  <li key={assignment.id} className="rounded-lg border border-secondary p-4">
                    <p className="font-medium">{assignment.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due: {formatDate(assignment.dueDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {assignment.submissionsCount} submissions
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {assignment.pendingSubmissionsCount} pending
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading title="Materials" />
          </CardHeader>
          <CardContent>
            {classGroup.materials.length === 0 ? (
              <EmptyState>No materials</EmptyState>
            ) : (
              <ul className="space-y-3">
                {classGroup.materials.map((material) => (
                  <li key={material.id} className="rounded-lg border border-secondary p-4">
                    <p className="font-medium">{material.title}</p>
                    {material.fileHref ? (
                      <Button asChild variant="secondary" size="sm" className="mt-3">
                        <a href={material.fileHref} aria-label={`Open Material ${material.title}`}>
                          Open Material - {material.title}
                        </a>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading title="Pending Submissions" />
          </CardHeader>
          <CardContent>
            {classGroup.pendingSubmissions.length === 0 ? (
              <EmptyState>No pending submissions</EmptyState>
            ) : (
              <ul className="space-y-3">
                {classGroup.pendingSubmissions.map((submission) => (
                  <li key={submission.id} className="rounded-lg border border-secondary p-4">
                    <p className="font-medium">Student: {submission.student.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      Assignment: {submission.assignment.title}
                    </p>
                    <Button asChild variant="secondary" size="sm" className="mt-3">
                      <Link href={submission.reviewHref}>Review</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
