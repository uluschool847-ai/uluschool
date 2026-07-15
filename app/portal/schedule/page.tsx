import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import {
  formatMonth,
  getMonthRange as getNairobiMonthRange,
} from "@/components/portal/schedule-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { listLessonsForStudent, listLessonsForTeacher } from "@/lib/repositories/lesson-repository";
import { listScheduleForUser } from "@/lib/repositories/schedule-repository";
import { DEFAULT_AVAILABILITY_TIMEZONE, utcToLocalDateTime } from "@/lib/scheduling/availability";

export const metadata: Metadata = {
  title: "Portal Schedule",
  description: "Class calendar and live lesson links.",
};

type SchedulePageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

type ScheduleLessonItem = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  liveLessonUrl: string;
  status?: string | null;
  cancelReason?: string | null;
  subject?: { id: string; name: string; slug: string } | null;
  classGroup?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string; email: string } | null;
};

function getMonthRange(monthValue?: string) {
  const range = getNairobiMonthRange(monthValue);
  return { start: range.from, end: new Date(range.to.getTime() + 1) };
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DEFAULT_AVAILABILITY_TIMEZONE,
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_AVAILABILITY_TIMEZONE,
  }).format(date);
}

function canJoinLesson(status?: string | null) {
  return status !== "CANCELLED" && status !== "COMPLETED";
}

function shouldShowStatus(title: string, status?: string | null) {
  if (!status) return true;
  return !title.toLowerCase().includes(status.toLowerCase());
}

export default async function PortalSchedulePage({ searchParams }: SchedulePageProps) {
  const session = await requireRole([
    UserRole.ADMIN,
    UserRole.TEACHER,
    UserRole.PARENT,
    UserRole.STUDENT,
  ]);
  const resolved = searchParams ? await searchParams : undefined;
  const { start, end } = getMonthRange(resolved?.month);
  const classes: ScheduleLessonItem[] =
    session.role === UserRole.STUDENT
      ? ((await listLessonsForStudent(session.uid, {
          from: start,
          to: end,
        })) as ScheduleLessonItem[])
      : session.role === UserRole.TEACHER
        ? ((await listLessonsForTeacher(session.uid, {
            from: start,
            to: end,
          })) as ScheduleLessonItem[])
        : ((await listScheduleForUser(
            session.uid,
            session.role,
            start,
            end,
          )) as ScheduleLessonItem[]);

  const grouped = new Map<string, ScheduleLessonItem[]>();
  for (const item of classes) {
    const key = utcToLocalDateTime({
      date: new Date(item.startAt),
      timezone: DEFAULT_AVAILABILITY_TIMEZONE,
    }).slice(0, 10);
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }

  return (
    <main className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Class Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <form method="get" className="flex items-center gap-3">
            <label htmlFor="month" className="font-medium text-foreground">
              Month
            </label>
            <input
              id="month"
              name="month"
              type="month"
              defaultValue={formatMonth(start)}
              className="h-11 rounded-md border border-input bg-background px-3"
            />
            <Button type="submit" size="sm">
              Apply
            </Button>
          </form>
          <p>
            Showing classes for {formatDateLabel(start)} -{" "}
            {formatDateLabel(new Date(end.getTime() - 1))}
          </p>
        </CardContent>
      </Card>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No classes scheduled for this period.
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([dateKey, dayClasses]) => (
          <Card key={dateKey}>
            <CardHeader>
              <CardTitle>{formatDateLabel(new Date(dateKey))}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dayClasses.map((item) => (
                <article key={item.id} className="rounded-lg border border-secondary p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Subject: {item.subject?.name ?? "General"}
                      </p>
                      {item.classGroup ? (
                        <p className="text-sm text-muted-foreground">
                          Group: {item.classGroup.name}
                        </p>
                      ) : null}
                      <p className="text-sm text-muted-foreground">
                        {formatTime(new Date(item.startAt))} - {formatTime(new Date(item.endAt))}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Teacher: {item.teacher?.fullName || "TBA"}
                      </p>
                      {shouldShowStatus(item.title, item.status ?? "SCHEDULED") ? (
                        <p className="text-sm text-muted-foreground">
                          Status: {item.status ?? "SCHEDULED"}
                        </p>
                      ) : null}
                      {item.status === "CANCELLED" && item.cancelReason ? (
                        <p className="text-sm text-muted-foreground">
                          Cancel reason: {item.cancelReason}
                        </p>
                      ) : null}
                    </div>
                    {canJoinLesson(item.status) ? (
                      <Button asChild size="sm">
                        <a
                          href={item.liveLessonUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Join Live Lesson"
                        >
                          Join
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </main>
  );
}
