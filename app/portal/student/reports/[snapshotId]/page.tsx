import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getReportSnapshotForStudent } from "@/lib/repositories/report-repository";
import { preferredStoredFileHref } from "@/lib/security/storage-links";

type PageProps = {
  params: Promise<{ snapshotId: string }> | { snapshotId: string };
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => getRecord(item)) : [];
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

function getText(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function scoreText(value: unknown) {
  return typeof value === "number" ? String(value) : "Not graded";
}

function pdfHref(snapshot: { id: string; pdfStorageKey?: string | null }) {
  return preferredStoredFileHref(snapshot.pdfStorageKey, snapshot.pdfStorageKey);
}

export default async function StudentReportSnapshotPage({ params }: PageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const { snapshotId } = await params;
  const snapshot = await getReportSnapshotForStudent(session.uid, snapshotId);
  if (!snapshot) notFound();

  const data = getRecord(snapshot.snapshotData);
  const student = getRecord(data.student);
  const term = getRecord(data.academicTerm ?? data.term);
  const classGroup = getRecord(data.classGroup);
  const grades = getRecord(data.grades);
  const categories = getArray(grades.categories);
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
        <Link className="text-sm text-primary" href="/portal/student/reports">
          Back to reports
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Report</h1>
        <p>{getText(student.fullName, "Student")}</p>
        <p>{getText(term.name, "Academic term")}</p>
        {getText(classGroup.name) ? <p>{getText(classGroup.name)}</p> : null}
        {generatedAt ? <p>Generated: {generatedAt}</p> : null}
        <p>Weighted term average: {String(grades.weightedTermAverage ?? "No average")}</p>
      </header>

      <section className="space-y-3 rounded-lg border p-4" aria-label="PDF">
        <h2 className="text-xl font-semibold">PDF</h2>
        {safePdfHref ? (
          <Link className="text-primary" href={safePdfHref}>
            Download PDF
          </Link>
        ) : (
          <p>PDF is not available yet.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4" aria-label="Category averages">
        <h2 className="text-xl font-semibold">Category averages</h2>
        {categories.length === 0 ? (
          <p>No category averages available.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((category, index) => (
              <li key={`${getText(category.label, "Category")}-${index}`}>
                Category average: {scoreText(category.average)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4" aria-label="Homework grades">
        <h2 className="text-xl font-semibold">Assignment grades</h2>
        {homeworkGrades.length === 0 ? (
          <p>No homework grades yet.</p>
        ) : (
          <ul className="space-y-3">
            {homeworkGrades.map((grade, index) => {
              const subject = getRecord(grade.subject);
              return (
                <li className="rounded-md border p-3" key={`${getText(grade.title)}-${index}`}>
                  <h3 className="font-semibold">{getText(grade.title, "Grade")}</h3>
                  <p>Score: {scoreText(grade.score)}</p>
                  {getText(subject.name) ? <p>Subject: {getText(subject.name)}</p> : null}
                  {formatDate(getText(grade.submittedAt)) ? (
                    <p>Submitted: {formatDate(getText(grade.submittedAt))}</p>
                  ) : null}
                  {formatDate(getText(grade.gradedAt)) ? (
                    <p>Graded: {formatDate(getText(grade.gradedAt))}</p>
                  ) : null}
                  {getText(grade.feedback) ? <p>Feedback: {getText(grade.feedback)}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4" aria-label="Manual grades">
        <h2 className="text-xl font-semibold">Manual</h2>
        {manualGrades.length === 0 ? (
          <p>No manual grades yet.</p>
        ) : (
          <ul className="space-y-3">
            {manualGrades.map((grade, index) => {
              const subject = getRecord(grade.subject);
              return (
                <li className="rounded-md border p-3" key={`${getText(grade.title)}-${index}`}>
                  <h3 className="font-semibold">{getText(grade.title, "Grade")}</h3>
                  <p>Score: {scoreText(grade.score)}</p>
                  {getText(subject.name) ? <p>Subject: {getText(subject.name)}</p> : null}
                  {formatDate(getText(grade.gradedAt)) ? (
                    <p>Graded: {formatDate(getText(grade.gradedAt))}</p>
                  ) : null}
                  {getText(grade.description) ? (
                    <p>Description: {getText(grade.description)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-4" aria-label="Attendance">
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

      <section className="space-y-3 rounded-lg border p-4" aria-label="Progress notes">
        <h2 className="text-xl font-semibold">Progress notes</h2>
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

      <section className="space-y-3 rounded-lg border p-4" aria-label="Teacher comment">
        <h2 className="text-xl font-semibold">Teacher comment</h2>
        <p>{teacherComment || "No teacher comment."}</p>
      </section>
    </main>
  );
}
