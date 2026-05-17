import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { TeacherForm } from "@/components/admin/teachers/TeacherForm";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getSubjects } from "@/lib/repositories/catalogue-repository";
import { getAdminTeachers } from "@/lib/repositories/cms-repository";
import { findAllUsers } from "@/lib/repositories/portal-repository";

export const metadata: Metadata = {
  title: "Create Teacher - Admin",
};

export const dynamic = "force-dynamic";

type CreateTeacherPageProps = {
  searchParams?: Promise<{
    teacherError?: string;
  }>;
};

export default async function CreateTeacherPage({ searchParams }: CreateTeacherPageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const teacherError = resolvedSearchParams?.teacherError;
  const [subjects, teacherUsers, teachers] = await Promise.all([
    getSubjects(),
    findAllUsers({ role: UserRole.TEACHER, limit: 1000 }),
    getAdminTeachers(),
  ]);
  const linkedCabinetUserIds = new Set(
    teachers
      .map((teacher) => teacher.cabinetUserId)
      .filter((userId): userId is string => Boolean(userId)),
  );
  const cabinetUsers = (teacherUsers.items ?? teacherUsers.data ?? []).filter(
    (user) => user.isActive && !linkedCabinetUserIds.has(user.id),
  );

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/teachers">← Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Teacher</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a public marketing profile for the /teachers page.
          </p>
        </div>
      </div>

      <TeacherForm
        mode="create"
        subjects={subjects}
        cabinetUsers={cabinetUsers}
        flashError={teacherError}
        successRedirect="/admin/teachers"
        errorRedirect="/admin/teachers/new"
      />
    </main>
  );
}
