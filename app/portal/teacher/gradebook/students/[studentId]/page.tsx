import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getTeacherStudentGradebook } from "@/lib/repositories/gradebook-repository";

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveSearchParams(searchParams: PageProps["searchParams"]) {
  return (await searchParams) ?? {};
}

export default async function TeacherStudentGradebookPage({ params, searchParams }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const { studentId } = await params;
  const query = await resolveSearchParams(searchParams);
  const gradebook = await getTeacherStudentGradebook(session.uid, studentId, query.termId ?? "");

  if (!gradebook) {
    notFound();
  }

  return (
    <main>
      <Link href="/portal/teacher/gradebook">Back to gradebook</Link>
      <h1>{gradebook.student.fullName} Gradebook</h1>
      <p>{gradebook.term.name}</p>
      <p>Term average: {gradebook.termAverage ?? "No average"}</p>

      <section aria-label="Homework grades">
        {gradebook.homeworkGrades.length === 0 ? (
          <p>No homework grades.</p>
        ) : (
          <ul>
            {gradebook.homeworkGrades.map((grade) => (
              <li key={grade.id}>
                <span>{grade.title}</span>
                <span>{grade.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Manual grades">
        {gradebook.manualGrades.length === 0 ? (
          <p>No manual grades.</p>
        ) : (
          <ul>
            {gradebook.manualGrades.map((grade) => (
              <li key={grade.id}>
                <span>Entry</span>
                <span>{grade.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="manual-history">
        <h2 id="manual-history">Manual grade history</h2>
        {gradebook.manualGradeHistory.length === 0 ? (
          <p>No archived manual grades.</p>
        ) : (
          <ul>
            {gradebook.manualGradeHistory.map((grade) => (
              <li key={grade.id}>
                <span>{grade.title}</span>
                <span>{grade.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
