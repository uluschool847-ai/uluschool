import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubjectForm } from "@/components/admin/subjects/SubjectForm";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";
import { getSubjectById } from "@/lib/repositories/subject-repository";

export const metadata: Metadata = {
  title: "Edit Subject - Admin",
};

type EditSubjectPageProps = {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

export default async function EditSubjectPage({ params, searchParams }: EditSubjectPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const subject = await getSubjectById(resolvedParams.id);

  if (!subject) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/subjects">Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Edit Subject</h1>
          <p className="mt-2 text-sm text-slate-600">
            Update academic subject metadata and active state.
          </p>
        </div>
      </div>

      <SubjectForm
        mode="edit"
        subject={subject}
        flashMessage={resolvedSearchParams?.subjectMessage}
        flashError={resolvedSearchParams?.subjectError}
        successRedirect="/admin/subjects"
        errorRedirect={`/admin/subjects/${resolvedParams.id}/edit`}
      />
    </main>
  );
}
