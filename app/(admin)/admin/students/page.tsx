import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { toggleStudentStatusAction } from "@/app/(admin)/admin/students/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  type AdminStudentRegistryRecord,
  type StudentLearningStatusValue,
  getAdminStudents,
} from "@/lib/repositories/portal-repository";
import { getAdminScheduledClassById } from "@/lib/repositories/schedule-repository";

export const metadata: Metadata = {
  title: "Students - Admin",
};

type SearchParams = Record<string, string | undefined>;

type StudentsPageProps = {
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

function parseLearningStatus(value?: string): StudentLearningStatusValue | undefined {
  if (value === "TRIAL" || value === "ACTIVE" || value === "PAUSED" || value === "INACTIVE") {
    return value;
  }

  return undefined;
}

function formatLearningStatus(status: StudentLearningStatusValue) {
  const lower = status.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
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
  learningStatus?: StudentLearningStatusValue;
  parentLinked?: boolean;
  classLinked?: boolean;
  classId?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.q) {
    searchParams.set("q", params.q);
  }

  if (params.page && params.page > 1) {
    searchParams.set("page", String(params.page));
  }

  if (params.isActive !== undefined) {
    searchParams.set("isActive", String(params.isActive));
  }

  if (params.learningStatus !== undefined) {
    searchParams.set("learningStatus", params.learningStatus);
  }

  if (params.parentLinked !== undefined) {
    searchParams.set("parentLinked", String(params.parentLinked));
  }

  if (params.classLinked !== undefined) {
    searchParams.set("classLinked", String(params.classLinked));
  }

  if (params.classId) {
    searchParams.set("classId", params.classId);
  }

  const query = searchParams.toString();
  return query ? `/admin/students?${query}` : "/admin/students";
}

function FlashBanner({
  message,
  error,
}: {
  message?: string;
  error?: string;
}) {
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

function StudentRow({
  student,
  returnPath,
  enrollmentClassId,
}: {
  student: AdminStudentRegistryRecord;
  returnPath: string;
  enrollmentClassId?: string;
}) {
  const editPath = enrollmentClassId
    ? `/admin/students/${student.id}/edit?classId=${encodeURIComponent(enrollmentClassId)}`
    : `/admin/students/${student.id}/edit`;

  return (
    <tr className="border-b last:border-b-0">
      <td className="px-4 py-3 align-top">
        <div className="space-y-1">
          <div className="font-medium text-slate-950">{student.fullName}</div>
          <div className="text-xs text-slate-500">{student.email}</div>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-slate-600">
        {student.parents.length === 0 ? "—" : joinNames(student.parents, "—")}
      </td>
      <td className="px-4 py-3 align-top text-slate-600">
        {student.enrolledClasses.length === 0
          ? "—"
          : student.enrolledClasses.map((enrolledClass) => enrolledClass.title).join(", ")}
      </td>
      <td className="px-4 py-3 align-top text-slate-600">
        {student.derivedTeachers.length === 0 ? "—" : joinNames(student.derivedTeachers, "—")}
      </td>
      <td className="px-4 py-3 align-top text-slate-600">{formatDate(student.createdAt)}</td>
      <td className="px-4 py-3 align-top text-slate-600">{formatDate(student.updatedAt)}</td>
      <td className="px-4 py-3 align-top">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            student.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
          }`}
        >
          {student.isActive ? "Account Active" : "Account Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
          {`Lifecycle ${formatLearningStatus(student.learningStatus)}`}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={editPath}>Edit</Link>
          </Button>
          <form
            action={toggleStudentStatusAction as unknown as (formData: FormData) => void}
            className="inline-flex"
          >
            <input type="hidden" name="id" value={student.id} />
            <input type="hidden" name="isActive" value={student.isActive ? "false" : "true"} />
            <input type="hidden" name="flash" value="true" />
            <input type="hidden" name="successRedirect" value={returnPath} />
            <input type="hidden" name="errorRedirect" value={returnPath} />
            <Button type="submit" size="sm" variant="secondary">
              {student.isActive ? "Deactivate" : "Activate"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export default async function AdminStudentsPage({ searchParams }: StudentsPageProps = {}) {
  await requireRole([UserRole.ADMIN]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const studentMessage = resolvedSearchParams?.studentMessage?.trim() || undefined;
  const studentError = resolvedSearchParams?.studentError?.trim() || undefined;
  const page = parsePage(resolvedSearchParams?.page);
  const searchQuery = resolvedSearchParams?.q?.trim() || undefined;
  const isActive = parseBoolean(resolvedSearchParams?.isActive);
  const learningStatus = parseLearningStatus(resolvedSearchParams?.learningStatus);
  const parentLinked = parseBoolean(resolvedSearchParams?.parentLinked);
  const classLinked = parseBoolean(resolvedSearchParams?.classLinked);
  const enrollmentClassId = resolvedSearchParams?.classId?.trim() || undefined;
  const registryPath = buildRegistryPath({
    q: searchQuery,
    page,
    isActive,
    learningStatus,
    parentLinked,
    classLinked,
    classId: enrollmentClassId,
  });

  const [result, enrollmentTarget] = await Promise.all([
    getAdminStudents({
      page,
      limit: PAGE_SIZE,
      searchQuery,
      isActive,
      learningStatus,
      parentLinked,
      classLinked,
    }),
    enrollmentClassId ? getAdminScheduledClassById(enrollmentClassId) : Promise.resolve(null),
  ]);
  const students = result.items ?? [];

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Students</h1>
            <p className="text-sm text-slate-600">
              Review the full student registry, linked parents, class enrollments, and derived
              teachers.
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/students/new">Create Student</Link>
          </Button>
        </div>
      </header>

      <FlashBanner message={studentMessage} error={studentError} />

      {enrollmentClassId ? (
        <section aria-label="Selected enrollment class">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-700">
                {enrollmentTarget
                  ? `Enrollment target: ${enrollmentTarget.title}. Open a student with Edit, then add this class in Class enrollments.`
                  : "Selected class was not found. Choose a valid scheduled class before enrolling students."}
              </p>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section aria-label="Student registry filters">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-6" action="/admin/students">
              <label className="grid gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
                Search by name or email
                <input
                  name="q"
                  type="search"
                  defaultValue={searchQuery ?? ""}
                  placeholder="Alice Student"
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
                Parents
                <select
                  name="parentLinked"
                  defaultValue={resolvedSearchParams?.parentLinked ?? ""}
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">Any</option>
                  <option value="true">Linked</option>
                  <option value="false">Unlinked</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Learning status
                <select
                  name="learningStatus"
                  defaultValue={resolvedSearchParams?.learningStatus ?? ""}
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="">All</option>
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Classes
                <select
                  name="classLinked"
                  defaultValue={resolvedSearchParams?.classLinked ?? ""}
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

      <section aria-label="Student registry results">
        <Card>
          <CardHeader>
            <CardTitle>Student Registry</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-slate-600">
                No students found. Create or enrol students to populate the registry.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium">Parents</th>
                      <th className="px-4 py-3 font-medium">Classes</th>
                      <th className="px-4 py-3 font-medium">Teachers</th>
                      <th className="px-4 py-3 font-medium">Created</th>
                      <th className="px-4 py-3 font-medium">Updated</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Learning</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <StudentRow
                        key={student.id}
                        student={student}
                        returnPath={registryPath}
                        enrollmentClassId={enrollmentTarget ? enrollmentClassId : undefined}
                      />
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
