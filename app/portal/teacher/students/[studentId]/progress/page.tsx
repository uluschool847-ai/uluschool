import { UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentProgressManager } from "@/app/portal/teacher/components/StudentProgressManager";
import { requireRole } from "@/lib/auth/session";
import {
  type ProgressStatusFilter,
  getTeacherStudentDetail,
  listProgressNotesForTeacherStudent,
} from "@/lib/repositories/student-progress-repository";

type TeacherStudentProgressPageProps = {
  params: Promise<{ studentId: string }> | { studentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

function normalizeStatus(value?: string): ProgressStatusFilter {
  return value === "archived" || value === "all" ? value : "active";
}

export default async function TeacherStudentProgressPage({
  params,
  searchParams,
}: TeacherStudentProgressPageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const { studentId } = await params;
  const query = searchParams ? await searchParams : {};
  const status = normalizeStatus(query.status);
  const subjectId = query.subjectId?.trim() || undefined;

  const student = await getTeacherStudentDetail(session.uid, studentId);
  if (!student) {
    notFound();
  }

  const subjects = student.subjects ?? [];
  const filters = {
    status,
    ...(subjectId ? { subjectId } : {}),
  };
  const notes = await listProgressNotesForTeacherStudent(session.uid, studentId, filters);

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap gap-3">
          <Link href={`/portal/teacher/students/${student.id}`}>Back to Student</Link>
          <Link href="/portal/teacher/progress">Back to Progress</Link>
          <Link href={`/portal/teacher/progress?studentId=${student.id}`}>Filter by Student</Link>
        </div>
        <h1 className="text-2xl font-semibold">{student.fullName} Progress</h1>
        <p>{student.email}</p>
      </header>

      <form className="flex flex-wrap gap-3" method="get">
        <label htmlFor="progress-status">Status</label>
        <select id="progress-status" name="status" defaultValue={status}>
          <option value="active">Current notes</option>
          <option value="archived">History</option>
          <option value="all">All notes</option>
        </select>

        <label htmlFor="progress-filter-subject">Topic filter</label>
        <select id="progress-filter-subject" name="subjectId" defaultValue={subjectId ?? ""}>
          <option value="">All topics</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>

        <button type="submit">Apply</button>
      </form>

      <StudentProgressManager
        studentId={student.id}
        subjectId={subjectId ?? subjects[0]?.id}
        subjects={subjects}
        notes={notes}
      />
    </main>
  );
}
