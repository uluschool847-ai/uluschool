import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentClassEnrollments } from "@/components/admin/students/StudentClassEnrollments";
import { StudentForm } from "@/components/admin/students/StudentForm";
import { StudentParentLinks } from "@/components/admin/students/StudentParentLinks";
import { StudentStatusControl } from "@/components/admin/students/StudentStatusControl";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import {
  getEnrolledClasses,
  getLinkedParents,
  listAvailableClassesForStudentEnrollment,
} from "@/lib/repositories/portal-repository";
import { findUserById, listUsersByRole } from "@/lib/repositories/user-repository";

export const metadata: Metadata = {
  title: "Edit Student - Admin",
};

type EditStudentPageProps = {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<{
    studentMessage?: string;
    studentError?: string;
    classId?: string;
  }>;
};

export default async function EditStudentPage({ params, searchParams }: EditStudentPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const preferredClassId = resolvedSearchParams?.classId?.trim() || undefined;
  const student = await findUserById(resolvedParams.id);

  if (!student || student.role !== UserRole.STUDENT) {
    notFound();
  }

  const [linkedParents, parentCandidates, enrolledClasses, availableClasses] = await Promise.all([
    getLinkedParents(student.id),
    listUsersByRole(UserRole.PARENT),
    getEnrolledClasses(student.id),
    listAvailableClassesForStudentEnrollment(student.id),
  ]);
  const availableParents = [...linkedParents, ...parentCandidates].reduce<
    Array<{ id: string; fullName: string; email: string | null }>
  >((items, parent) => {
    if (items.some((item) => item.id === parent.id)) {
      return items;
    }

    items.push(parent);
    return items;
  }, []);

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/students">← Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Edit Student</h1>
          <p className="mt-2 text-sm text-slate-600">Update the student account profile fields.</p>
        </div>
      </div>

      <StudentForm
        mode="edit"
        student={student}
        flashMessage={resolvedSearchParams?.studentMessage}
        flashError={resolvedSearchParams?.studentError}
        successRedirect="/admin/students"
        errorRedirect={`/admin/students/${resolvedParams.id}/edit`}
      />

      <StudentStatusControl
        studentId={student.id}
        currentStatus={student.learningStatus ?? "ACTIVE"}
        accountIsActive={student.isActive}
        flashMessage={resolvedSearchParams?.studentMessage}
        flashError={resolvedSearchParams?.studentError}
        successRedirect={`/admin/students/${resolvedParams.id}/edit`}
        errorRedirect={`/admin/students/${resolvedParams.id}/edit`}
      />

      <StudentParentLinks
        studentId={student.id}
        linkedParents={linkedParents}
        availableParents={availableParents}
        flashMessage={resolvedSearchParams?.studentMessage}
        flashError={resolvedSearchParams?.studentError}
      />

      <StudentClassEnrollments
        studentId={student.id}
        enrolledClasses={enrolledClasses}
        availableClasses={availableClasses}
        preferredClassId={preferredClassId}
        flashMessage={resolvedSearchParams?.studentMessage}
        flashError={resolvedSearchParams?.studentError}
      />
    </main>
  );
}
