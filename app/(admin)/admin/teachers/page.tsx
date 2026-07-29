import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { TeacherRowActions } from "@/components/admin/teachers/TeacherRowActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getAdminTeachers } from "@/lib/repositories/cms-repository";

export const metadata: Metadata = {
  title: "Teachers - Admin",
};

export const dynamic = "force-dynamic";

type AdminTeachersPageProps = {
  searchParams?: Promise<{
    teacherMessage?: string;
    teacherError?: string;
  }>;
};

function TeacherFlash({ message, error }: { message?: string; error?: string }) {
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

function formatUpdatedAt(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function AdminTeachersPage({ searchParams }: AdminTeachersPageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const teacherMessage = resolvedSearchParams?.teacherMessage;
  const teacherError = resolvedSearchParams?.teacherError;
  const teachers = await getAdminTeachers();

  return (
    <main className="space-y-6">
      <TeacherFlash message={teacherMessage} error={teacherError} />
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Teachers</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage public teacher marketing profiles shown on the teachers page.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/teachers/new">Create Teacher</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Teacher Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teacher profiles yet. Create the first teacher profile to publish your teaching
              team.
            </p>
          ) : (
            <div className="relative overflow-x-auto rounded-md border">
              <table className="min-w-[1080px] w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Teacher</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Subjects</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Cabinet access</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Updated</th>
                    <th className="whitespace-nowrap px-4 py-3 font-medium">Status</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {teachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {teacher.photoUrl ? (
                            <img
                              src={teacher.photoUrl}
                              alt={teacher.fullName}
                              className="h-12 w-12 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              role="img"
                              aria-label={`Placeholder avatar for ${teacher.fullName}`}
                              className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground"
                            >
                              {teacher.fullName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-slate-950">{teacher.fullName}</div>
                            <div className="text-xs text-muted-foreground">
                              Order {teacher.displayOrder}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{teacher.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {teacher.subjects.length === 0 ? (
                          <span>—</span>
                        ) : (
                          <fieldset className="flex flex-wrap gap-2">
                            <legend className="sr-only">Teacher subjects</legend>
                            {teacher.subjects.map((subject) => (
                              <Badge key={subject.id} variant="secondary">
                                {subject.name}
                              </Badge>
                            ))}
                          </fieldset>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {teacher.cabinetUserId ? "Linked account" : "No linked account"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatUpdatedAt(teacher.updatedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            teacher.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {teacher.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/teachers/${teacher.id}/edit`}>Edit</Link>
                        </Button>
                        {teacher.cabinetUserId ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/teachers/${teacher.cabinetUserId}/availability`}>
                              Availability
                            </Link>
                          </Button>
                        ) : null}
                        <TeacherRowActions teacher={teacher} />
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
