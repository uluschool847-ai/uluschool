import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { SubjectForm } from "@/components/admin/subjects/SubjectForm";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create Subject - Admin",
};

type NewSubjectPageProps = {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

export default async function NewSubjectPage({ searchParams }: NewSubjectPageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/subjects">Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Create Subject</h1>
          <p className="mt-2 text-sm text-slate-600">
            Add an academic subject for catalogue, teachers, and class scheduling.
          </p>
        </div>
      </div>

      <SubjectForm
        mode="create"
        flashMessage={resolvedSearchParams?.subjectMessage}
        flashError={resolvedSearchParams?.subjectError}
        successRedirect="/admin/subjects"
        errorRedirect="/admin/subjects/new"
      />
    </main>
  );
}
