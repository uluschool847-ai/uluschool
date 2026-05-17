import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ParentForm } from "@/components/admin/parents/ParentForm";
import { ParentStudentLinks } from "@/components/admin/parents/ParentStudentLinks";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getAdminParentById } from "@/lib/repositories/portal-repository";
import { findUserById, listUsersByRole } from "@/lib/repositories/user-repository";

export const metadata: Metadata = {
  title: "Edit Parent - Admin",
};

export const dynamic = "force-dynamic";

type EditParentPageProps = {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<{
    parentMessage?: string;
    parentError?: string;
  }>;
};

export default async function EditParentPage({ params, searchParams }: EditParentPageProps) {
  noStore();
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parentTarget = await findUserById(resolvedParams.id);

  if (!parentTarget || parentTarget.role !== UserRole.PARENT) {
    return notFound();
  }

  const [parent, studentCandidates] = await Promise.all([
    getAdminParentById(parentTarget.id),
    listUsersByRole(UserRole.STUDENT),
  ]);

  if (!parent || parent.role !== UserRole.PARENT) {
    return notFound();
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/parents">← Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Edit Parent</h1>
          <p className="mt-2 text-sm text-slate-600">
            Update the parent account profile fields and linked students.
          </p>
        </div>
      </div>

      <ParentForm
        mode="edit"
        parent={parentTarget}
        flashMessage={resolvedSearchParams?.parentMessage}
        flashError={resolvedSearchParams?.parentError}
        successRedirect="/admin/parents"
        errorRedirect={`/admin/parents/${resolvedParams.id}/edit`}
      />

      <ParentStudentLinks
        parentId={parent.id}
        linkedStudents={parent.children}
        availableStudents={studentCandidates}
        flashMessage={resolvedSearchParams?.parentMessage}
        flashError={resolvedSearchParams?.parentError}
      />
    </main>
  );
}
