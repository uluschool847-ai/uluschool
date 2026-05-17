import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import { toggleParentStatusAction } from "@/app/(admin)/admin/parents/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  type AdminParentRegistryRecord,
  getAdminParents,
} from "@/lib/repositories/portal-repository";

export const metadata: Metadata = {
  title: "Parents - Admin",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

type ParentsPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

const PAGE_SIZE = 20;

function parsePage(page?: string) {
  const parsed = Number(page);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseBoolean(value?: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function joinNames(items: Array<{ fullName: string }>, fallback: string) {
  return items.length > 0 ? items.map((item) => item.fullName).join(", ") : fallback;
}

function buildRegistryPath(params: {
  q?: string;
  page?: number;
  isActive?: boolean;
  studentLinked?: boolean;
}) {
  const searchParams = new URLSearchParams();

  if (params.q) searchParams.set("q", params.q);
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));
  if (params.isActive !== undefined) searchParams.set("isActive", String(params.isActive));
  if (params.studentLinked !== undefined) {
    searchParams.set("studentLinked", String(params.studentLinked));
  }

  const query = searchParams.toString();
  return query ? `/admin/parents?${query}` : "/admin/parents";
}

function FlashBanner({ message, error }: { message?: string; error?: string }) {
  if (error) {
    return (
      <div
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (message) {
    return (
      <output className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {message}
      </output>
    );
  }

  return null;
}

function ParentRow({
  parent,
  returnPath,
}: { parent: AdminParentRegistryRecord; returnPath: string }) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-3 align-top">
        <div className="space-y-1">
          <div className="font-medium text-slate-950">{parent.fullName}</div>
          <div className="text-xs text-slate-500">{parent.email}</div>
          <div className="text-xs text-slate-500">{parent.phoneWhatsapp ?? "No phone"}</div>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-slate-600">
        {parent.children.length === 0 ? "No linked students" : joinNames(parent.children, "—")}
      </td>
      <td className="px-4 py-3 align-top text-slate-600">{formatDate(parent.createdAt)}</td>
      <td className="px-4 py-3 align-top text-slate-600">{formatDate(parent.updatedAt)}</td>
      <td className="px-4 py-3 align-top">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            parent.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
          }`}
        >
          {parent.isActive ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/parents/${parent.id}`}>View</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/parents/${parent.id}/edit`}>Edit</Link>
          </Button>
          <form
            action={toggleParentStatusAction as unknown as (formData: FormData) => void}
            className="inline-flex"
          >
            <input type="hidden" name="id" value={parent.id} />
            <input type="hidden" name="isActive" value={parent.isActive ? "false" : "true"} />
            <input type="hidden" name="flash" value="true" />
            <input type="hidden" name="successRedirect" value={returnPath} />
            <input type="hidden" name="errorRedirect" value={returnPath} />
            <Button type="submit" size="sm" variant="secondary">
              {parent.isActive ? "Deactivate" : "Activate"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export default async function AdminParentsPage({ searchParams }: ParentsPageProps = {}) {
  noStore();
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parentMessage = resolvedSearchParams?.parentMessage?.trim() || undefined;
  const parentError = resolvedSearchParams?.parentError?.trim() || undefined;
  const page = parsePage(resolvedSearchParams?.page);
  const searchQuery = resolvedSearchParams?.q?.trim() || undefined;
  const isActive = parseBoolean(resolvedSearchParams?.isActive);
  const studentLinked = parseBoolean(resolvedSearchParams?.studentLinked);
  const registryPath = buildRegistryPath({ q: searchQuery, page, isActive, studentLinked });

  const result = await getAdminParents({
    page,
    limit: PAGE_SIZE,
    searchQuery,
    isActive,
    studentLinked,
  });
  const parents = result.items ?? [];

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Parents & Guardians
            </h1>
            <p className="text-sm text-slate-600">
              Manage parent portal accounts and student relationships.
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/parents/new">Create Parent</Link>
          </Button>
        </div>
      </header>

      <FlashBanner message={parentMessage} error={parentError} />

      <section aria-label="Parent registry filters">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-4" action="/admin/parents">
              <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
                Search by name or email
                <input
                  name="q"
                  type="search"
                  defaultValue={searchQuery ?? ""}
                  placeholder="Mary Parent"
                  className="rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Status
                <select
                  name="isActive"
                  defaultValue={resolvedSearchParams?.isActive ?? ""}
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">All</option>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Students
                <select
                  name="studentLinked"
                  defaultValue={resolvedSearchParams?.studentLinked ?? ""}
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">Any</option>
                  <option value="true">Linked</option>
                  <option value="false">Unlinked</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button type="submit" className="w-full lg:w-auto">
                  Apply filters
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <section aria-label="Parent registry results">
        <Card>
          <CardHeader>
            <CardTitle>Parent Registry</CardTitle>
          </CardHeader>
          <CardContent>
            {parents.length === 0 ? (
              <p className="text-sm text-slate-600">
                No parent records found. Create the first parent account to populate the registry.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Parent</th>
                      <th className="px-4 py-3 font-medium">Linked Students</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parents.map((parent) => (
                      <ParentRow key={parent.id} parent={parent} returnPath={registryPath} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
