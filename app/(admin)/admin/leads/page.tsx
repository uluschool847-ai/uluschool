import { UserRole } from "@prisma/client";
import Link from "next/link";

import { AdminCrmListControls } from "@/components/admin/crm/AdminCrmListControls";
import { requireRole } from "@/lib/auth/session";
import { getSubmissions } from "@/lib/repositories/admin-submission-repository";

type PageProps = {
  searchParams?: Promise<{ search?: string; page?: string }> | { search?: string; page?: string };
};

type LeadListItem = {
  id: string;
  referenceId?: string | null;
  fullName?: string | null;
  email?: string | null;
};

export default async function AdminLeadsPage({ searchParams }: PageProps) {
  await requireRole([UserRole.ADMIN]);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const search = resolvedSearchParams?.search ?? "";
  const page = Number.parseInt(resolvedSearchParams?.page ?? "1", 10) || 1;
  const leads = (await getSubmissions({
    entityType: "lead",
    search,
    page,
  })) as LeadListItem[];

  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-950">Contact Leads</h1>
        <p className="text-sm text-slate-600">
          Search by reference ID to find a specific contact lead.
        </p>
      </div>

      <AdminCrmListControls
        basePath="/admin/leads"
        initialPage={page}
        initialQuery={search}
        queryParam="search"
      />

      {leads.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No results found for this reference ID.
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-semibold text-slate-900">{item.referenceId}</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{item.fullName}</p>
              {"email" in item ? (
                <p className="text-sm text-slate-600">{item.email as string}</p>
              ) : null}
              <Link
                href={`/admin/leads/${item.id}`}
                className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open lead details
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
