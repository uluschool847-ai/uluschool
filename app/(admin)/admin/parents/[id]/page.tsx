import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getAdminParentById } from "@/lib/repositories/portal-repository";

export const metadata: Metadata = {
  title: "Parent Detail - Admin",
};

export const dynamic = "force-dynamic";

type ParentDetailPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function EmptyState({ children }: { children: string }) {
  return <p className="text-sm text-slate-600">{children}</p>;
}

export default async function AdminParentDetailPage({ params }: ParentDetailPageProps) {
  noStore();
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;
  const parent = await getAdminParentById(resolvedParams.id);

  if (!parent || parent.role !== UserRole.PARENT) {
    return notFound();
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Parent Detail</h1>
            <p className="text-sm text-slate-600">
              Read-only view of the account and linked students.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/parents">Back to registry</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <div className="grid gap-1">
                <dt className="text-slate-500">Full name</dt>
                <dd className="font-medium text-slate-950">{parent.fullName}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-950">{parent.email}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">WhatsApp</dt>
                <dd className="font-medium text-slate-950">
                  {parent.phoneWhatsapp ?? "Not provided"}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-slate-950">{formatDate(parent.createdAt)}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">Updated</dt>
                <dd className="font-medium text-slate-950">{formatDate(parent.updatedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                parent.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
              }`}
            >
              {parent.isActive ? "Active" : "Inactive"}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portal Access</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700">Provided by this AppUser account.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked Students</CardTitle>
          </CardHeader>
          <CardContent>
            {parent.children.length === 0 ? (
              <EmptyState>No linked students yet.</EmptyState>
            ) : (
              <ul className="space-y-2 text-sm text-slate-700">
                {parent.children.map((student) => (
                  <li
                    key={student.id}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    {student.email ? `${student.fullName} (${student.email})` : student.fullName}
                    {student.isActive === false ? " - Inactive" : ""}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
