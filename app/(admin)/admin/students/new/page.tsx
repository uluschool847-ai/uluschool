import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { StudentForm } from "@/components/admin/students/StudentForm";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create Student - Admin",
};

type CreateStudentPageProps = {
  searchParams?: Promise<{
    studentMessage?: string;
    studentError?: string;
  }>;
};

export default async function CreateStudentPage({ searchParams }: CreateStudentPageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/students">← Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Create Student</h1>
          <p className="mt-2 text-sm text-slate-600">
            Create an AppUser account with the STUDENT role.
          </p>
        </div>
      </div>

      <StudentForm
        mode="create"
        flashMessage={resolvedSearchParams?.studentMessage}
        flashError={resolvedSearchParams?.studentError}
        successRedirect="/admin/students"
        errorRedirect="/admin/students/new"
      />
    </main>
  );
}
