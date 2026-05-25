import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listReportSnapshotsForParentChild } from "@/lib/repositories/report-repository";
import { UserRole } from "@prisma/client";

type PageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveParams<T>(params: Promise<T> | T) {
  return await params;
}

export default async function ParentReportsPage({ params, searchParams }: PageProps) {
  const session = await requireRole([UserRole.PARENT]);
  const { studentId } = await resolveParams(params);
  const query = searchParams ? await searchParams : {};
  const reports = await listReportSnapshotsForParentChild(session.uid, studentId, {
    ...(query.termId ? { termId: query.termId } : {}),
  });

  return (
    <main>
      <h1>Reports</h1>
      {reports.length === 0 ? (
        <p>No reports available for this student.</p>
      ) : (
        <ul>
          {reports.map((report) => (
            <li key={report.id}>
              <p>{report.childName}</p>
              <p>{report.academicTermName}</p>
              <Link href={report.href}>View report</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
