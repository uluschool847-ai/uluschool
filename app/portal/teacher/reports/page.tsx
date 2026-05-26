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
    ...(params.search ? { search: params.search } : {}),
    ...(params.sort ? { sort: params.sort } : {}),
    ...(params.pdf ? { pdf: params.pdf } : {}),
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
        <label>
          Search
          <input name="search" defaultValue={params.search ?? ""} />
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={params.sort ?? "generatedAtDesc"}>
            <option value="generatedAtDesc">Newest first</option>
            <option value="generatedAtAsc">Oldest first</option>
            <option value="term">Term</option>
            <option value="classGroup">Class/group</option>
            <option value="average">Average</option>
          </select>
        </label>
        <label>
          PDF
          <select name="pdf" defaultValue={params.pdf ?? "all"}>
            <option value="all">All</option>
            <option value="available">PDF available</option>
            <option value="missing">PDF missing</option>
          </select>
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
              <p>{report.pdfAvailable ? "PDF available" : "PDF not generated"}</p>
              <Link href={report.href}>View report</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
