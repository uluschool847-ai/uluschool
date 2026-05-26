import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getReportSnapshotForParent } from "@/lib/repositories/report-repository";

type PageProps = {
  params:
    | Promise<{ snapshotId: string; studentId: string }>
    | { snapshotId: string; studentId: string };
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => getRecord(item)) : [];
}

function getText(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function scoreText(value: unknown) {
  return typeof value === "number" ? String(value) : "Not recorded";
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

function pdfHref(snapshot: { pdfStorageKey?: string | null }) {
  const storageKey = snapshot.pdfStorageKey?.trim();
  if (!storageKey) return null;
  if (!storageKey.startsWith("/uploads/")) return null;
  if (storageKey.includes("\\") || storageKey.includes("..")) return null;
  return storageKey;
}

function categoryRows(grades: Record<string, unknown>, data: Record<string, unknown>) {
  const rows = getArray(grades.categories);
  return rows.length > 0 ? rows : getArray(data.categoryAverages);
}

export default async function ParentReportSnapshotPage({ params }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { snapshotId, studentId } = await params;
  const snapshot = await getReportSnapshotForParent(session.uid, studentId, snapshotId);
  if (!snapshot) notFound();

  const data = getRecord(snapshot.snapshotData);
  const student = getRecord(data.student);
  const term = getRecord(data.academicTerm ?? data.term);
  const classGroup = getRecord(data.classGroup);
  const grades = getRecord(data.grades);
  const categories = categoryRows(grades, data);
  const homeworkGrades = getArray(grades.homeworkGrades);
  const manualGrades = getArray(grades.manualGrades);
  const attendance = getRecord(data.attendance);
  const attendanceHistory = getArray(data.attendanceHistory);
  const progressNotes = getArray(data.progressNotes);
  const teacherComment = getText(data.teacherComment) || getText(snapshot.teacherComment);
  const generatedAt = formatDate(snapshot.generatedAt);
  const safePdfHref = pdfHref(snapshot);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          className="text-sm text-primary underline"
          href={`/portal/parent/reports/${studentId}`}
        >
          Back to reports
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Report</h1>
        <p>{getText(student.fullName, "Student")}</p>
        <p>{getText(term.name, "Academic term")}</p>
        {getText(classGroup.name) ? <p>{getText(classGroup.name)}</p> : null}
        {generatedAt ? <p>Generated: {generatedAt}</p> : null}
        <p>Weighted term average: {String(grades.weightedTermAverage ?? "No average")}</p>
      </header>

      <section aria-label="PDF" className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xl font-semibold">PDF</h2>
        {safePdfHref ? (
          <Link className="text-primary underline" href={safePdfHref}>
            Download PDF
          </Link>
        ) : (
          <p>PDF is not available yet.</p>
        )}
      </section>

      <section aria-label="Grades summary" className="space-y-4 rounded-lg border p-4">
        <h2 className="text-xl font-semibold">Grades summary</h2>
        {categories.length === 0 ? (
          <p>No category averages available.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((category, index) => (
              <li key={`${getText(category.label, "Category")}-${index}`}>
                Category average: {scoreText(category.average)}
                {typeof category.weight === "number" ? `; Weight: ${category.weight}%` : ""}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold">Assignment rows</h3>
          {homeworkGrades.length === 0 ? (
            <p>No homework rows in this report.</p>
          ) : (
            <ul className="space-y-2">
              {homeworkGrades.map((grade, index) => (
                <li className="rounded-md border p-3" key={`${getText(grade.title)}-${index}`}>
                  <h4 className="font-semibold">{getText(grade.title, "Homework")}</h4>
                  <p>Score: {scoreText(grade.score)}</p>
                  {getText(grade.feedback) ? <p>Feedback: {getText(grade.feedback)}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Manual rows</h3>
          {manualGrades.length === 0 ? (
            <p>No manual rows in this report.</p>
          ) : (
            <ul className="space-y-2">
              {manualGrades.map((grade, index) => (
                <li className="rounded-md border p-3" key={`${getText(grade.title)}-${index}`}>
                  <h4 className="font-semibold">{getText(grade.title, "Manual grade")}</h4>
                  <p>Score: {scoreText(grade.score)}</p>
                  {getText(grade.description) ? (
                    <p>Description: {getText(grade.description)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-label="Attendance" className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xl font-semibold">Attendance</h2>
        <p>Present: {scoreText(attendance.present)}</p>
        <p>Late: {scoreText(attendance.late)}</p>
        <p>Absent: {scoreText(attendance.absent)}</p>
        {attendanceHistory.length > 0 ? (
          <ul className="space-y-2">
            {attendanceHistory.map((record, index) => (
              <li key={`${getText(record.lessonTitle, "Lesson")}-${index}`}>
                {getText(record.lessonTitle, "Lesson")}: {getText(record.status, "Status")}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label="Progress" className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xl font-semibold">Progress</h2>
        {progressNotes.length === 0 ? (
          <p>No progress notes in this report.</p>
        ) : (
          <ul className="space-y-2">
            {progressNotes.map((note, index) => (
              <li key={`${getText(note.content ?? note.teacherNotes)}-${index}`}>
                <p>{getText(note.content ?? note.teacherNotes, "Progress note")}</p>
                {getText(note.performanceLevel) ? (
                  <p>Level: {getText(note.performanceLevel)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Teacher comment" className="space-y-3 rounded-lg border p-4">
        <h2 className="text-xl font-semibold">Teacher comment</h2>
        <p>{teacherComment || "No teacher comment."}</p>
      </section>
    </main>
  );
}
