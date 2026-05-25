import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import {
  listAcademicTerms,
  listTeacherGradebookOverview,
} from "@/lib/repositories/gradebook-repository";
import { UserRole } from "@prisma/client";

type PageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

async function resolveSearchParams(searchParams: PageProps["searchParams"]) {
  return (await searchParams) ?? {};
}

export default async function TeacherGradebookPage({ searchParams }: PageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const params = await resolveSearchParams(searchParams);
  const termId = params.termId;
  const [terms, overview] = await Promise.all([
    listAcademicTerms(),
    listTeacherGradebookOverview(session.uid, { termId }),
  ]);

  return (
    <main>
      <h1>Gradebook</h1>

      <form aria-label="Gradebook filters">
        <label htmlFor="termId">Academic term</label>
        <select id="termId" name="termId" defaultValue={termId ?? ""}>
          <option value="">Active term</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        <button type="submit">Apply</button>
      </form>

      <section aria-labelledby="class-gradebooks">
        <h2 id="class-gradebooks">Classes</h2>
        {overview.classGroups.length === 0 ? (
          <p>No class gradebooks yet.</p>
        ) : (
          <ul>
            {overview.classGroups.map((classGroup) => (
              <li key={classGroup.id}>
                <Link href={classGroup.href}>{classGroup.name}</Link>
                <span>{classGroup.studentsCount} students</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="student-gradebooks">
        <h2 id="student-gradebooks">Students</h2>
        {overview.students.length === 0 ? (
          <p>No student gradebooks yet.</p>
        ) : (
          <ul>
            {overview.students.map((student) => (
              <li key={student.id}>
                <Link href={student.href}>{student.fullName}</Link>
                <span>{student.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
