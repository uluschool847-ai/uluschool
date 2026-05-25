import { UserRole } from "@prisma/client";
import { notFound } from "next/navigation";

import { exportReportSnapshotPdfAction } from "@/app/portal/teacher/actions/report-actions";
import { requireRole } from "@/lib/auth/session";
import { getReportSnapshotForTeacher } from "@/lib/repositories/report-repository";

type PageProps = {
  params: Promise<{ snapshotId: string }> | { snapshotId: string };
};

async function resolveParams(params: PageProps["params"]) {
  return await params;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function TeacherReportSnapshotPage({ params }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const { snapshotId } = await resolveParams(params);
  const snapshot = await getReportSnapshotForTeacher(session.uid, snapshotId);
  if (!snapshot) notFound();

  const data = getRecord(snapshot.snapshotData);
  const student = getRecord(data.student);
  const term = getRecord(data.academicTerm ?? data.term);
  const grades = getRecord(data.grades);
  const exportAction = async () => {
    "use server";
    await exportReportSnapshotPdfAction(snapshot.id);
  };

  return (
    <main>
      <h1>Saved Report</h1>
      <p>{String(student.fullName ?? "Student")}</p>
      <p>{String(term.name ?? "Academic term")}</p>
      <p>Weighted term average: {String(grades.weightedTermAverage ?? "No average")}</p>
      <p>{String(data.teacherComment ?? snapshot.teacherComment ?? "No teacher comment")}</p>
      <p>Snapshot version: {snapshot.snapshotVersion}</p>
      <form action={exportAction}>
        <button type="submit">Export PDF</button>
      </form>
    </main>
  );
}
