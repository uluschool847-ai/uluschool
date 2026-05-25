import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import {
  calculateWeightedTermAverage,
  getTeacherClassGroupGradebook,
} from "@/lib/repositories/gradebook-repository";

type PageProps = {
  params: Promise<{ classGroupId: string }> | { classGroupId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveSearchParams(searchParams: PageProps["searchParams"]) {
  return (await searchParams) ?? {};
}

export default async function TeacherClassGradebookPage({ params, searchParams }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const { classGroupId } = await params;
  const query = await resolveSearchParams(searchParams);
  const gradebook = await getTeacherClassGroupGradebook(
    session.uid,
    classGroupId,
    query.termId ?? "",
  );

  if (!gradebook) {
    notFound();
  }

  return (
    <main>
      <Link href="/portal/teacher/gradebook">Back to gradebook</Link>
      <h1>{gradebook.classGroup.name} Gradebook</h1>
      <p>{gradebook.term.name}</p>
      <p>Homework weight: {gradebook.categoryWeights.HOMEWORK}</p>
      <p>Manual weight: {gradebook.categoryWeights.MANUAL}</p>

      {gradebook.rows.length === 0 ? (
        <p>No student grades yet.</p>
      ) : (
        <ul>
          {gradebook.rows.map((row) => (
            <li key={row.student.id}>
              <Link href={row.studentGradebookHref}>{row.student.fullName}</Link>
              <p>{row.student.email}</p>
              <p>Homework average: {row.homeworkAverage ?? "No grades"}</p>
              <p>Manual average: {row.manualAverage ?? "No grades"}</p>
              <p>
                Term average:{" "}
                {row.termAverage ??
                  calculateWeightedTermAverage({
                    categoryAverages: {
                      HOMEWORK: row.homeworkAverage,
                      MANUAL: row.manualAverage,
                    },
                  }) ??
                  "No average"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
