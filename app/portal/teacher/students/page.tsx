import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listTeacherStudentsForProgress } from "@/lib/repositories/student-progress-repository";
import { UserRole } from "@prisma/client";

export default async function TeacherStudentsPage() {
  const session = await requireRole([UserRole.TEACHER]);
  const students = await listTeacherStudentsForProgress(session.uid);

  return (
    <main className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Students</h1>
      </header>

      {students.length === 0 ? (
        <p>No assigned students.</p>
      ) : (
        <section aria-label="Assigned students">
          <div className="grid gap-3">
            {students.map((student) => (
              <article key={student.id} className="rounded-md border p-4">
                <h2 className="text-lg font-medium">
                  <Link href={student.href}>{student.fullName}</Link>
                </h2>
                <p>{student.email}</p>
                <p>{student.learningStatus ?? "No learning status"}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
