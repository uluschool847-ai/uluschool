import { UserRole } from "@prisma/client";
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

export default async function ParentReportSnapshotPage({ params }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { snapshotId, studentId } = await params;
  const snapshot = await getReportSnapshotForParent(session.uid, studentId, snapshotId);
  if (!snapshot) notFound();

  const data = getRecord(snapshot.snapshotData);
  const student = getRecord(data.student);
  const term = getRecord(data.academicTerm ?? data.term);

  return (
    <main>
      <h1>Report</h1>
      <p>{String(student.fullName ?? "Student")}</p>
      <p>{String(term.name ?? "Academic term")}</p>
    </main>
  );
}
