import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  getEnrolledClasses,
  getLinkedParents,
  getStudentProgress,
} from "@/lib/repositories/portal-repository";
import { findUserById, getStudentProfile } from "@/lib/repositories/user-repository";

export const metadata: Metadata = {
  title: "Student Detail - Admin",
};

type StudentDetailPageProps = {
  params: Promise<{ id: string }> | { id: string };
};

type LinkedParent = {
  id: string;
  fullName: string;
  email: string | null;
};

type EnrolledClass = {
  id: string;
  title: string;
  startAt: Date;
  teacher: { id: string; fullName: string } | null;
};

type RecentSubmission = {
  id: string;
  assignment: {
    id: string;
    title: string;
  };
};

type StudentProgressRecord = {
  id: string;
  gradeLevel: string;
  teacherNotes: string;
  recordedAt: Date;
  subject: {
    name: string;
  };
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function distinctTeachers(classes: EnrolledClass[]) {
  const teachers = new Map<string, { id: string; fullName: string }>();

  for (const enrolledClass of classes) {
    if (!enrolledClass.teacher) {
      continue;
    }

    if (!teachers.has(enrolledClass.teacher.id)) {
      teachers.set(enrolledClass.teacher.id, enrolledClass.teacher);
    }
  }

  return Array.from(teachers.values());
}

function EmptyState({ children }: { children: string }) {
  return <p className="text-sm text-slate-600">{children}</p>;
}

function formatLearningStatus(status?: "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE" | null) {
  const value = status ?? "ACTIVE";
  const lower = value.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

function DetailList({
  items,
  emptyMessage,
}: {
  items: string[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <EmptyState>{emptyMessage}</EmptyState>;
  }

  return (
    <ul className="space-y-2 text-sm text-slate-700">
      {items.map((item) => (
        <li key={item} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function AdminStudentDetailPage({ params }: StudentDetailPageProps) {
  await requireRole([UserRole.ADMIN]);
  const resolvedParams = await params;

  const student = await findUserById(resolvedParams.id);
  if (!student || student.role !== UserRole.STUDENT) {
    notFound();
  }

  const [linkedParents, enrolledClasses, profile, progressRecords] = await Promise.all([
    getLinkedParents(student.id),
    getEnrolledClasses(student.id),
    getStudentProfile(student.id),
    getStudentProgress(student.id),
  ]);

  const derivedTeachers = distinctTeachers(enrolledClasses as EnrolledClass[]);
  const recentSubmissions = profile?.recentSubmissions ?? [];

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Student Detail</h1>
            <p className="text-sm text-slate-600">
              Single source of truth for the student account and academic context.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/students">Back to registry</Link>
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
                <dd className="font-medium text-slate-950">{student.fullName}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-950">{student.email}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">WhatsApp</dt>
                <dd className="font-medium text-slate-950">
                  {student.phoneWhatsapp ?? "Not provided"}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-slate-950">{formatDate(student.createdAt)}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-slate-500">Updated</dt>
                <dd className="font-medium text-slate-950">{formatDate(student.updatedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Account access
              </p>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                  student.isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {student.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Learning status
              </p>
              <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {formatLearningStatus(student.learningStatus)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked Parents</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={linkedParents.map((parent: LinkedParent) =>
                parent.email ? `${parent.fullName} (${parent.email})` : parent.fullName,
              )}
              emptyMessage="No linked parents yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enrolled Classes</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={enrolledClasses.map((enrolledClass: EnrolledClass) => {
                const teacherLabel = enrolledClass.teacher
                  ? `Teacher: ${enrolledClass.teacher.fullName}`
                  : "Teacher: Unassigned";
                return `${enrolledClass.title} | Starts ${formatDateTime(enrolledClass.startAt)} | ${teacherLabel}`;
              })}
              emptyMessage="No enrolled classes yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Derived Teachers</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={derivedTeachers.map((teacher) => teacher.fullName)}
              emptyMessage="No derived teachers yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={recentSubmissions.map(
                (submission: RecentSubmission) => submission.assignment.title,
              )}
              emptyMessage="No recent submissions yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={progressRecords.map(
                (progress: StudentProgressRecord) =>
                  `${progress.subject.name} | ${progress.gradeLevel} | ${progress.teacherNotes} | ${formatDate(progress.recordedAt)}`,
              )}
              emptyMessage="No progress reports available yet."
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
