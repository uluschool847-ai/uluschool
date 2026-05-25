import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getParentChildGradebook } from "@/lib/repositories/gradebook-repository";

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveSearchParams(searchParams: PageProps["searchParams"]) {
  return (await searchParams) ?? {};
}

export default async function ParentChildGradebookPage({ params, searchParams }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await params;
  const query = await resolveSearchParams(searchParams);
  const gradebook = await getParentChildGradebook(session.uid, studentId, query.termId ?? "");

  if (!gradebook) {
    notFound();
  }

  return (
    <main>
      <h1>{gradebook.student.fullName} Gradebook</h1>
      <p>{gradebook.term.name}</p>
      {gradebook.categories.map((category) => (
        <p key={category.label}>
          {category.label}: {category.average ?? "No grades"}
        </p>
      ))}
      <p>
        {gradebook.termAverage === null
          ? "No grade average yet"
          : `Term average: ${gradebook.termAverage}`}
      </p>
    </main>
  );
}
