import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { ParentForm } from "@/components/admin/parents/ParentForm";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Create Parent - Admin",
};

export const dynamic = "force-dynamic";

type CreateParentPageProps = {
  searchParams?: Promise<{
    parentMessage?: string;
    parentError?: string;
  }>;
};

export default async function CreateParentPage({ searchParams }: CreateParentPageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/parents">← Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Create Parent</h1>
          <p className="mt-2 text-sm text-slate-600">
            Create an AppUser account with the PARENT role and parent portal access.
          </p>
        </div>
      </div>

      <ParentForm
        mode="create"
        flashMessage={resolvedSearchParams?.parentMessage}
        flashError={resolvedSearchParams?.parentError}
        successRedirect="/admin/parents"
        errorRedirect="/admin/parents/new"
      />
    </main>
  );
}
