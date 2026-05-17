import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TeacherForm } from "@/components/admin/teachers/TeacherForm";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getSubjects } from "@/lib/repositories/catalogue-repository";
import { getAdminTeachers, getTeacherById } from "@/lib/repositories/cms-repository";
import { findAllUsers } from "@/lib/repositories/portal-repository";
import { findUserById } from "@/lib/repositories/user-repository";

export const metadata: Metadata = {
  title: "Edit Teacher - Admin",
};

export const dynamic = "force-dynamic";

type EditTeacherPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    teacherError?: string;
  }>;
};

export default async function EditTeacherPage({ params, searchParams }: EditTeacherPageProps) {
  await requireRole([UserRole.ADMIN]);

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const teacherError = resolvedSearchParams?.teacherError;
  const [teacher, subjects, teacherUsers, teachers] = await Promise.all([
    getTeacherById(id),
    getSubjects(),
    findAllUsers({ role: UserRole.TEACHER, limit: 1000 }),
    getAdminTeachers(),
  ]);
  if (!teacher) {
    notFound();
  }
  const linkedCabinetUserIds = new Set(
    teachers
      .filter((item) => item.id !== teacher.id)
      .map((item) => item.cabinetUserId)
      .filter((userId): userId is string => Boolean(userId)),
  );
  const cabinetUsers = (teacherUsers.items ?? teacherUsers.data ?? []).filter(
    (user) => user.isActive && !linkedCabinetUserIds.has(user.id),
  );
  const currentCabinetUser =
    teacher.cabinetUserId && !cabinetUsers.some((user) => user.id === teacher.cabinetUserId)
      ? await findUserById(teacher.cabinetUserId)
      : null;

  if (currentCabinetUser) {
    cabinetUsers.push(currentCabinetUser);
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/teachers">← Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Teacher</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Update the public profile shown on the /teachers page.
          </p>
        </div>
      </div>

      <TeacherForm
        mode="edit"
        teacher={teacher}
        subjects={subjects}
        cabinetUsers={cabinetUsers}
        flashError={teacherError}
        successRedirect="/admin/teachers"
        errorRedirect={`/admin/teachers/${teacher.id}/edit`}
      />
    </main>
  );
}
