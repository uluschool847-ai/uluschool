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

function clean(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function formatDate(date?: Date | string | null) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(value);
}

function formatScore(score: number | null | undefined) {
  return typeof score === "number" ? score.toString() : "Not graded";
}

export default async function ParentChildGradebookPage({ params, searchParams }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await params;
  const query = await resolveSearchParams(searchParams);
  const termId = clean(query.termId) ?? "";
  const gradebook = await getParentChildGradebook(session.uid, studentId, termId);

  if (!gradebook) {
    notFound();
  }

  const homeworkCategory = gradebook.categories.find(
    (category) => category.category === "HOMEWORK",
  );
  const manualCategory = gradebook.categories.find((category) => category.category === "MANUAL");
  const termStart = formatDate(gradebook.term.startDate);
  const termEnd = formatDate(gradebook.term.endDate);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1
          aria-label={`${gradebook.student.fullName} Gradebook`}
          className="text-3xl font-bold tracking-tight"
        >
          Gradebook
        </h1>
        <p>{gradebook.student.fullName}</p>
      </header>

      <section aria-label="Selected term" className="space-y-3 rounded-lg border p-4">
        <p className="text-xl font-semibold">{gradebook.term.name}</p>
        {termStart && termEnd ? (
          <p>
            {termStart} - {termEnd}
          </p>
        ) : null}
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="grid gap-1 text-sm font-medium">
            Term
            <input
              className="h-10 rounded-md border px-3"
              defaultValue={termId}
              name="termId"
              placeholder="Current term"
            />
          </label>
          <button className="h-10 rounded-md border px-4 font-medium" type="submit">
            Apply filters
          </button>
        </form>
      </section>

      <p className="rounded-lg border p-4 text-lg font-semibold">
        {gradebook.termAverage === null
          ? "No weighted average yet"
          : `Weighted average: ${gradebook.termAverage}`}
      </p>

      <section aria-label="Homework" className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="text-xl font-semibold">Homework</h2>
          <p>Weight: {gradebook.categoryWeights.HOMEWORK}%</p>
          <p>Category average: {homeworkCategory?.average === null ? "No grades" : "Recorded"}</p>
        </div>
        {gradebook.homeworkGrades.length === 0 ? (
          <p>No homework grades yet.</p>
        ) : (
          <ul className="space-y-3">
            {gradebook.homeworkGrades.map((grade) => (
              <li className="rounded-md border p-3" key={grade.id}>
                <article className="space-y-1">
                  <p className="font-semibold">{grade.title}</p>
                  <p>Score: {formatScore(grade.score)}</p>
                  {grade.subject ? <p>Subject: {grade.subject.name}</p> : null}
                  {formatDate(grade.submittedAt) ? (
                    <p>Submitted: {formatDate(grade.submittedAt)}</p>
                  ) : null}
                  {formatDate(grade.gradedAt) ? <p>Graded: {formatDate(grade.gradedAt)}</p> : null}
                  {grade.feedback ? <p>Feedback: {grade.feedback}</p> : null}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Manual" className="space-y-4 rounded-lg border p-4">
        <div>
          <h2 className="text-xl font-semibold">Manual</h2>
          <p>Weight: {gradebook.categoryWeights.MANUAL}%</p>
          <p>Category average: {manualCategory?.average === null ? "No grades" : "Recorded"}</p>
        </div>
        {gradebook.manualGrades.length === 0 ? (
          <p>No manual grades yet.</p>
        ) : (
          <ul className="space-y-3">
            {gradebook.manualGrades.map((grade) => (
              <li className="rounded-md border p-3" key={grade.id}>
                <article className="space-y-1">
                  <p className="font-semibold">{grade.title}</p>
                  <p>Score: {formatScore(grade.score)}</p>
                  {grade.subject ? <p>Subject: {grade.subject.name}</p> : null}
                  {formatDate(grade.gradedAt) ? <p>Graded: {formatDate(grade.gradedAt)}</p> : null}
                  {grade.description ? <p>Description: {grade.description}</p> : null}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Archived grade history" className="space-y-4 rounded-lg border p-4">
        <h2 className="text-xl font-semibold">Archived manual grade history</h2>
        {gradebook.manualGradeHistory.length === 0 ? (
          <p>No archived manual grade history.</p>
        ) : (
          <ul className="space-y-3">
            {gradebook.manualGradeHistory.map((grade) => (
              <li className="rounded-md border p-3" key={grade.id}>
                <article className="space-y-1">
                  <p className="font-semibold">{grade.title}</p>
                  <p>Score: {formatScore(grade.score)}</p>
                  {grade.subject ? <p>Subject: {grade.subject.name}</p> : null}
                  {formatDate(grade.archivedAt) ? (
                    <p>Archived: {formatDate(grade.archivedAt)}</p>
                  ) : null}
                  {grade.description ? <p>Description: {grade.description}</p> : null}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
