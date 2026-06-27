import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getTeacherStudentDetail } from "@/lib/repositories/student-progress-repository";

type TeacherStudentDetailPageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

export default async function TeacherStudentDetailPage({ params }: TeacherStudentDetailPageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const { studentId } = await params;
  const student = await getTeacherStudentDetail(session.uid, studentId);

  if (!student) {
    notFound();
  }

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <Link href="/portal/teacher/students">Back to Students</Link>
        <h1 className="text-2xl font-semibold">{student.fullName}</h1>
        <p>{student.email}</p>
        <p>{student.learningStatus ?? "No learning status"}</p>
      </header>

      <section aria-labelledby="student-classes-heading">
        <h2 id="student-classes-heading" className="text-lg font-semibold">
          Classes / Groups
        </h2>
        {student.classGroups.length === 0 ? (
          <p>No classes assigned.</p>
        ) : (
          <ul>
            {student.classGroups.map((group) => (
              <li key={group.id}>
                <Link href={group.href}>{group.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="upcoming-lessons-heading">
        <h2 id="upcoming-lessons-heading" className="text-lg font-semibold">
          Upcoming Lessons
        </h2>
        {student.upcomingLessons.length === 0 ? (
          <p>No upcoming lessons.</p>
        ) : (
          <ul>
            {student.upcomingLessons.map((lesson) => (
              <li key={lesson.id}>
                <Link href={lesson.href}>{lesson.title}</Link> {formatDate(lesson.startAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past-lessons-heading">
        <h2 id="past-lessons-heading" className="text-lg font-semibold">
          Past Lessons
        </h2>
        {student.pastLessons.length === 0 ? (
          <p>No past lessons.</p>
        ) : (
          <ul>
            {student.pastLessons.map((lesson) => (
              <li key={lesson.id}>
                <Link href={lesson.href}>{lesson.title}</Link> {formatDate(lesson.startAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="progress-summary-heading">
        <h2 id="progress-summary-heading" className="text-lg font-semibold">
          Progress Summary
        </h2>
        <p>Total notes: {student.progressSummary.totalNotes}</p>
        <p>
          Latest performance: {student.progressSummary.latestPerformanceLevel ?? "No notes yet"}
        </p>
        <Link href={student.progressHref}>Progress</Link>
      </section>
    </main>
  );
}
