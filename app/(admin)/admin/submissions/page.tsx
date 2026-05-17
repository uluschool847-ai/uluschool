import { UserRole } from "@prisma/client";

import { AdminCrmListControls } from "@/components/admin/crm/AdminCrmListControls";
import { requireRole } from "@/lib/auth/session";
import { getSubmissions } from "@/lib/repositories/admin-submission-repository";

type PageProps = {
  searchParams?: Promise<{ search?: string; page?: string }> | { search?: string; page?: string };
};

type SubmissionListItem = {
  id: string;
  referenceId?: string | null;
  studentName?: string | null;
  email?: string | null;
};

export default async function AdminSubmissionsPage({ searchParams }: PageProps) {
  await requireRole([UserRole.ADMIN]);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const search = resolvedSearchParams?.search ?? "";
  const page = Number.parseInt(resolvedSearchParams?.page ?? "1", 10) || 1;
  const submissions = (await getSubmissions({
    entityType: "enquiry",
    search,
    page,
  })) as SubmissionListItem[];

  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-950">Enrolment Submissions</h1>
        <p className="text-sm text-slate-600">
          Search by reference ID to find a specific enrolment enquiry.
        </p>
      </div>

      <AdminCrmListControls
        basePath="/admin/submissions"
        initialPage={page}
        initialQuery={search}
        queryParam="search"
      />

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No results found for this reference ID.
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-900">{item.referenceId}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{item.studentName}</p>
              {"email" in item ? (
                <p className="text-sm text-slate-600">{item.email as string}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
