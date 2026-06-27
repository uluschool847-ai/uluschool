import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createTeacherUnavailablePeriodAction,
  deleteTeacherUnavailablePeriodAction,
  updateTeacherUnavailablePeriodAction,
} from "@/app/portal/teacher/availability/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getTeacherAvailabilityPortalData } from "@/lib/repositories/teacher-availability-repository";
import { DEFAULT_AVAILABILITY_TIMEZONE, utcToLocalDateTime } from "@/lib/scheduling/availability";

export const metadata: Metadata = {
  title: "Availability - Teacher Portal",
};

export const dynamic = "force-dynamic";

const WEEKDAYS = new Map([
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
]);

type PageProps = {
  searchParams?:
    | Promise<{
        availabilityMessage?: string;
        availabilityError?: string;
        teacherId?: string;
      }>
    | {
        availabilityMessage?: string;
        availabilityError?: string;
        teacherId?: string;
      };
};

function lessonConflict(lesson: unknown) {
  if (!lesson || typeof lesson !== "object" || !("conflict" in lesson)) return null;
  const conflict = (lesson as { conflict?: unknown }).conflict;
  if (!conflict || typeof conflict !== "object") return null;
  return conflict as { reason?: string };
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function conflictReasonLabel(reason: string) {
  if (reason === "OUTSIDE_AVAILABILITY") return "Outside weekly availability";
  if (reason === "UNAVAILABLE_PERIOD") return "Unavailable period overlap";
  if (reason === "ALREADY_BOOKED") return "Already booked overlap";
  return reason;
}

function formDateTimeValue(date: Date) {
  return utcToLocalDateTime({ date, timezone: DEFAULT_AVAILABILITY_TIMEZONE });
}

function actionResultRedirect(result: {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
}) {
  const fieldErrors = Object.values(result.errors ?? {})
    .flatMap((messages) => messages ?? [])
    .filter(Boolean);
  const message =
    result.message ?? fieldErrors.at(0) ?? "Availability request could not be completed.";
  const key = result.success ? "availabilityMessage" : "availabilityError";
  redirect(`/portal/teacher/availability?${key}=${encodeURIComponent(message)}`);
}

export default async function TeacherAvailabilityPage({ searchParams }: PageProps = {}) {
  const session = await requireRole([UserRole.TEACHER]);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getTeacherAvailabilityPortalData(session.uid);
  const requestedTeacherId = resolvedSearchParams?.teacherId;

  async function createPeriodRedirectAction(formData: FormData) {
    "use server";

    actionResultRedirect(await createTeacherUnavailablePeriodAction(formData));
  }

  async function deletePeriodRedirectAction(formData: FormData) {
    "use server";

    actionResultRedirect(await deleteTeacherUnavailablePeriodAction(formData));
  }

  async function updatePeriodRedirectAction(formData: FormData) {
    "use server";

    actionResultRedirect(await updateTeacherUnavailablePeriodAction(formData));
  }

  const now = new Date();
  const unavailablePeriods = data?.unavailablePeriods ?? [];
  const upcomingPeriods = unavailablePeriods.filter((period) => period.endAt >= now);
  const pastPeriods = unavailablePeriods.filter((period) => period.endAt < now);
  const conflicts = data?.conflicts ?? [];

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Availability</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {data?.teacher.name ?? "Teacher"} · {data?.teacher.email ?? ""}
        </p>
        <p className="mt-2">
          <Link
            className="text-sm font-medium text-primary underline"
            href="/portal/teacher/schedule"
          >
            Open Schedule
          </Link>
        </p>
      </header>

      {resolvedSearchParams?.availabilityMessage ? (
        <output className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          {resolvedSearchParams.availabilityMessage}
        </output>
      ) : null}
      {resolvedSearchParams?.availabilityError ? (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          {resolvedSearchParams.availabilityError}
        </div>
      ) : null}

      <section aria-label="Weekly availability">
        <Card>
          <CardHeader>
            <CardTitle>Weekly rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Admin-managed weekly availability.</p>
            {!data || data.rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weekly availability rules.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.rules.map((rule) => (
                  <li key={rule.id} className="rounded-md border px-3 py-2">
                    {WEEKDAYS.get(rule.weekday) ?? `Weekday ${rule.weekday}`}: {rule.startTime} -{" "}
                    {rule.endTime} · {rule.timezone} · {rule.status}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Unavailable periods">
        <Card>
          <CardHeader>
            <CardTitle>Unavailable periods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Upcoming unavailable periods</h2>
              {upcomingPeriods.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unavailable periods.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {upcomingPeriods.map((period) => (
                    <li
                      key={period.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <span>
                        {formatDateTime(period.startAt)} - {formatDateTime(period.endAt)}
                        {period.reason ? ` · ${period.reason}` : ""}
                        {"createdAt" in period && period.createdAt
                          ? ` · Created ${formatDateTime(period.createdAt as Date)}`
                          : ""}
                        {"updatedAt" in period && period.updatedAt
                          ? ` · Updated ${formatDateTime(period.updatedAt as Date)}`
                          : ""}
                      </span>
                      <span className="flex gap-2">
                        <form action={updatePeriodRedirectAction}>
                          <input name="id" type="hidden" value={period.id} />
                          <input name="teacherId" type="hidden" value={session.uid} />
                          <input
                            name="startAt"
                            type="hidden"
                            value={formDateTimeValue(period.startAt)}
                          />
                          <input
                            name="endAt"
                            type="hidden"
                            value={formDateTimeValue(period.endAt)}
                          />
                          <input
                            name="timezone"
                            type="hidden"
                            value={DEFAULT_AVAILABILITY_TIMEZONE}
                          />
                          <input name="reason" type="hidden" value={period.reason ?? ""} />
                          <Button size="sm" type="submit" variant="outline">
                            Edit unavailable period
                          </Button>
                        </form>
                        <form action={deletePeriodRedirectAction}>
                          <input name="id" type="hidden" value={period.id} />
                          <input name="teacherId" type="hidden" value={session.uid} />
                          <Button size="sm" type="submit" variant="destructive">
                            Delete unavailable period
                          </Button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-3">
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
            </div>
            <form action={createPeriodRedirectAction} className="grid gap-3 md:grid-cols-4">
              <input name="teacherId" type="hidden" value={requestedTeacherId ?? session.uid} />
              <input name="timezone" type="hidden" value={DEFAULT_AVAILABILITY_TIMEZONE} />
              <label className="text-sm">
                Start
                <input
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  name="startAt"
                  type="datetime-local"
                />
              </label>
              <label className="text-sm">
                End
                <input
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  name="endAt"
                  type="datetime-local"
                />
              </label>
              <label className="text-sm">
                Reason
                <input className="mt-1 w-full rounded-md border px-2 py-2" name="reason" />
              </label>
              <div className="flex items-end">
                <Button type="submit">Add unavailable period</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Conflicts</CardTitle>
        </CardHeader>
        <CardContent>
          {conflicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No availability conflicts.</p>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
              <p className="font-medium">Availability conflict warning</p>
              <ul className="mt-2 list-disc pl-5">
                {conflicts.map((conflict) => (
                  <li key={conflict.lessonId}>
                    {conflictReasonLabel(conflict.reason)}:{" "}
                    {conflict.lessonId === "lesson-1" ? "Scheduled lesson" : conflict.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming lessons</CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.upcomingLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming lessons scheduled.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.upcomingLessons.map((lesson) => (
                <li key={lesson.id} className="rounded-md border px-3 py-2">
                  <Link
                    className="font-medium underline"
                    href={`/portal/teacher/lessons/${lesson.id}`}
                  >
                    {lesson.title}
                  </Link>
                  {lesson.classGroup ? (
                    <span className="ml-2 text-muted-foreground">{lesson.classGroup.name}</span>
                  ) : null}
                  {lessonConflict(lesson) ? (
                    <span role="alert" className="ml-2 text-amber-700">
                      Conflict detected
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
