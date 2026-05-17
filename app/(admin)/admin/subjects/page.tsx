import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";

import { SubjectFilters } from "@/components/admin/subjects/SubjectFilters";
import { SubjectRowActions } from "@/components/admin/subjects/SubjectRowActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { listAdminSubjects } from "@/lib/repositories/subject-repository";

export const metadata: Metadata = {
  title: "Subjects - Admin",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

type AdminSubjectsPageProps = {
  searchParams?: Promise<SearchParams> | SearchParams;
};

function parseActiveFilter(value?: string) {
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

function SubjectFlash({ message, error }: { message?: string; error?: string }) {
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

export default async function AdminSubjectsPage({ searchParams }: AdminSubjectsPageProps = {}) {
  noStore();
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const searchQuery = resolvedSearchParams?.q?.trim() || undefined;
  const isActive = parseActiveFilter(resolvedSearchParams?.isActive);
  const subjects = await listAdminSubjects({
    ...(searchQuery ? { searchQuery } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Subjects</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage academic subjects used across catalogue, teachers, progress, and scheduling.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/subjects/new">Create Subject</Link>
        </Button>
      </header>

      <SubjectFlash
        message={resolvedSearchParams?.subjectMessage}
        error={resolvedSearchParams?.subjectError}
      />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <SubjectFilters searchQuery={searchQuery} isActive={isActive} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject Registry</CardTitle>
        </CardHeader>
        <CardContent>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No subjects found. Create the first subject to power catalogue and class scheduling.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Teachers</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subjects.map((subject) => (
                    <tr key={subject.id}>
                      <td className="px-4 py-3 font-medium text-slate-950">{subject.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{subject.slug}</td>
                      <td className="max-w-sm px-4 py-3 text-muted-foreground">
                        {subject.description}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={subject.isActive ? "default" : "secondary"}>
                          {subject.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{subject.priority}</td>
                      <td className="px-4 py-3 text-muted-foreground">{subject.teachersCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(subject.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(subject.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <SubjectRowActions subject={subject} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
