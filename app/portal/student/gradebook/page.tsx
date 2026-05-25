import { UserRole } from "@prisma/client";

import { requireRole } from "@/lib/auth/session";
import { getStudentGradebook } from "@/lib/repositories/gradebook-repository";

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveSearchParams(searchParams: PageProps["searchParams"]) {
  return (await searchParams) ?? {};
}

function formatDate(date?: Date | string | null) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).formatToParts(value);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} ${month} ${year}`;
}

function formatScore(score: number | null | undefined) {
  return typeof score === "number" ? score.toString() : "Not graded";
}

function categoryAverage(value: number | null | undefined) {
  return typeof value === "number" ? value.toString() : "No grades";
}

export default async function StudentGradebookPage({ searchParams }: PageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const query = await resolveSearchParams(searchParams);
  const gradebook = await getStudentGradebook(session.uid, query.termId ?? "");
  const homeworkCategory = gradebook?.categories.find(
    (category) => category.category === "HOMEWORK",
  );
  const manualCategory = gradebook?.categories.find((category) => category.category === "MANUAL");
  const termStart = formatDate(gradebook?.term.startDate);
  const termEnd = formatDate(gradebook?.term.endDate);

  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Gradebook</h1>
      </div>
      {gradebook ? (
        <div className="space-y-6">
          <section aria-label="Selected term" className="rounded-lg border p-4">
            <h2 className="font-semibold">{gradebook.term.name}</h2>
            {termStart && termEnd ? (
              <p className="text-sm text-muted-foreground">
                {termStart} - {termEnd}
              </p>
            ) : null}
            <form className="mt-4 flex flex-wrap gap-2">
              <label className="text-sm" htmlFor="termId">
                Term
              </label>
              <input
                className="rounded-md border px-2 py-1 text-sm"
                defaultValue={query.termId ?? ""}
                id="termId"
                name="termId"
                placeholder="Current term"
              />
              <button className="rounded-md border px-3 py-1 text-sm" type="submit">
                Apply
              </button>
            </form>
          </section>

          <p className="rounded-lg border p-4 text-lg font-semibold">
            {gradebook.termAverage === null
              ? "No grade average yet"
              : `Term average: ${gradebook.termAverage}`}
          </p>

          <section aria-label="Homework" className="space-y-4 rounded-lg border p-4">
            <div>
              <h2 className="text-xl font-semibold">Homework</h2>
              <p>Weight: {gradebook.categoryWeights.HOMEWORK}%</p>
              <p>Average: {categoryAverage(homeworkCategory?.average)}</p>
            </div>
            {gradebook.homeworkGrades.length === 0 ? (
              <p>No homework grades yet.</p>
            ) : (
              <ul className="space-y-3">
                {gradebook.homeworkGrades.map((grade) => (
                  <li className="rounded-md border p-3" key={grade.id}>
                    <article className="space-y-1">
                      <h3 className="font-semibold">{grade.title}</h3>
                      <p>Score: {formatScore(grade.score)}</p>
                      {grade.subject ? <p>Subject: {grade.subject.name}</p> : null}
                      {formatDate(grade.submittedAt) ? (
                        <p>Submitted: {formatDate(grade.submittedAt)}</p>
                      ) : null}
                      {formatDate(grade.gradedAt) ? (
                        <p>Graded: {formatDate(grade.gradedAt)}</p>
                      ) : null}
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
              <p>Average: {categoryAverage(manualCategory?.average)}</p>
            </div>
            {gradebook.manualGrades.length === 0 ? (
              <p>No manual grades yet.</p>
            ) : (
              <ul className="space-y-3">
                {gradebook.manualGrades.map((grade) => (
                  <li className="rounded-md border p-3" key={grade.id}>
                    <article className="space-y-1">
                      <h3 className="font-semibold">{grade.title}</h3>
                      <p>Score: {formatScore(grade.score)}</p>
                      {grade.subject ? <p>Subject: {grade.subject.name}</p> : null}
                      {formatDate(grade.gradedAt) ? (
                        <p>Graded: {formatDate(grade.gradedAt)}</p>
                      ) : null}
                      {grade.description ? <p>Description: {grade.description}</p> : null}
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <p>No gradebook data yet.</p>
      )}
    </main>
  );
}
