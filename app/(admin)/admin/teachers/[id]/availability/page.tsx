import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TeacherAvailabilityRules } from "@/components/admin/teachers/TeacherAvailabilityRules";
import { TeacherUnavailablePeriods } from "@/components/admin/teachers/TeacherUnavailablePeriods";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import {
  findAvailableTeachers,
  getTeacherAvailabilityAdminData,
  listTeacherAvailabilityRules,
  listTeacherUnavailablePeriods,
} from "@/lib/repositories/teacher-availability-repository";

export const metadata: Metadata = {
  title: "Teacher Availability - Admin",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<{
    availabilityMessage?: string;
    availabilityError?: string;
  }>;
};

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Kiev",
  }).format(date);
}

function conflictReasonLabel(reason: string) {
  if (reason === "OUTSIDE_AVAILABILITY") return "Outside weekly availability";
  if (reason === "UNAVAILABLE_PERIOD") return "Unavailable period overlap";
  if (reason === "ALREADY_BOOKED") return "Already booked overlap";
  return reason;
}

export default async function AdminTeacherAvailabilityPage({ params, searchParams }: PageProps) {
  await requireRole([UserRole.ADMIN]);
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getTeacherAvailabilityAdminData(id);
  const ruleMessage = resolvedSearchParams?.availabilityMessage?.match(/availability rule/i)
    ? resolvedSearchParams.availabilityMessage
    : undefined;
  const periodMessage = resolvedSearchParams?.availabilityMessage?.match(/unavailable period/i)
    ? resolvedSearchParams.availabilityMessage
    : undefined;

  if (!data || data.teacher.role !== UserRole.TEACHER) {
    return notFound();
  }

  const [rules, unavailablePeriods, firstLessonAvailability] = await Promise.all([
    listTeacherAvailabilityRules(id),
    listTeacherUnavailablePeriods(id),
    data.upcomingLessons[0]
      ? findAvailableTeachers({
          teacherIds: [id],
          startAt: data.upcomingLessons[0].startAt,
          endAt: data.upcomingLessons[0].endAt,
          excludeLessonId: data.upcomingLessons[0].id,
        })
      : Promise.resolve([]),
  ]);
  const hasAvailabilityProbeConflict = firstLessonAvailability.some((result) => !result.available);
  const now = new Date();
  const upcomingPeriods = unavailablePeriods.filter((period) => period.endAt >= now);
  const pastPeriods = unavailablePeriods.filter((period) => period.endAt < now);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Teacher availability</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage weekly rules and blocked dates.</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium text-primary underline" href={`/admin/teachers/${id}`}>
            Back to teacher profile
          </Link>
          <Link className="font-medium text-primary underline" href="/portal/teacher/schedule">
            Schedule
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Teacher profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{data.teacher.name}</p>
          <p className="text-muted-foreground">{data.teacher.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conflicts</CardTitle>
        </CardHeader>
        <CardContent>
          {data.conflicts.length > 0 ? (
            <div
              role="alert"
              className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm"
            >
              <p className="font-medium">Availability conflict warning</p>
              {data.conflicts.some(
                (conflict) =>
                  "ownershipPath" in conflict && conflict.ownershipPath === "CLASS_GROUP_TEACHER",
              ) ? (
                <p className="mt-2">Class group owned lessons are included.</p>
              ) : null}
              <ul className="mt-2 list-disc pl-5">
                {data.conflicts.map((conflict) => (
                  <li key={conflict.lessonId}>
                    {conflict.title}: {conflictReasonLabel(conflict.reason)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No availability conflicts.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <TeacherAvailabilityRules
            teacherId={id}
            rules={rules}
            message={ruleMessage}
            error={resolvedSearchParams?.availabilityError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 text-xl font-semibold">Upcoming unavailable periods</h2>
          <TeacherUnavailablePeriods
            teacherId={id}
            periods={upcomingPeriods}
            message={periodMessage}
            error={resolvedSearchParams?.availabilityError}
          />
          <section aria-label="Past unavailable periods" className="mt-6 space-y-3">
            <h2 className="text-xl font-semibold">Past unavailable periods</h2>
            {pastPeriods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past unavailable periods.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {pastPeriods.map((period) => (
                  <li key={period.id} className="rounded-md border px-3 py-2">
                    {formatDateTime(period.startAt)} - {formatDateTime(period.endAt)}
                    {period.reason ? ` · ${period.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming lessons</CardTitle>
        </CardHeader>
        <CardContent>
          {hasAvailabilityProbeConflict ? (
            <p className="mb-3 text-sm text-amber-700">Availability conflict warning</p>
          ) : null}
          {data.upcomingLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming lessons scheduled.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.upcomingLessons.map((lesson) => (
                <li key={lesson.id} className="rounded-md border px-3 py-2">
                  <Link
                    className="font-medium underline"
                    href={`/admin/classes/${lesson.classGroup?.id ?? ""}/lessons/${lesson.id}`}
                  >
                    {lesson.title}
                  </Link>
                  {lesson.classGroup ? (
                    <span className="ml-2 text-muted-foreground">{lesson.classGroup.name}</span>
                  ) : null}
                  <span className="ml-2 text-muted-foreground">
                    {formatDateTime(lesson.startAt)} - {formatDateTime(lesson.endAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
