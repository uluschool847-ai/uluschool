import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listReportSnapshotsForTeacher } from "@/lib/repositories/report-repository";
import { UserRole } from "@prisma/client";

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveParams(searchParams: PageProps["searchParams"]) {
  return searchParams ? await searchParams : {};
}

function pickFilters(params: Record<string, string | undefined>) {
  return {
    ...(params.classGroupId ? { classGroupId: params.classGroupId } : {}),
    ...(params.studentId ? { studentId: params.studentId } : {}),
    ...(params.termId ? { termId: params.termId } : {}),
  };
}

export default async function TeacherReportsPage({ searchParams }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveParams(searchParams);
  const filters = pickFilters(params);
  const reports = await listReportSnapshotsForTeacher(session.uid, filters);

  return (
    <main>
      <h1>Reports</h1>
      <form aria-label="Report filters">
        <label>
          Student
          <input name="studentId" defaultValue={params.studentId ?? ""} />
        </label>
        <label>
          Class/group
          <input name="classGroupId" defaultValue={params.classGroupId ?? ""} />
        </label>
        <label>
          Academic term
          <input name="termId" defaultValue={params.termId ?? ""} />
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <Link href="/portal/teacher/reports/preview">Generate report preview</Link>
      {reports.length === 0 ? (
        <p>No saved reports yet.</p>
      ) : (
        <ul>
          {reports.map((report) => (
            <li key={report.id}>
              <p>{report.studentName}</p>
              <p>{report.classGroupName}</p>
              <p>{report.academicTermName}</p>
              <Link href={report.href}>View report</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
