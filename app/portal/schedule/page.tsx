import { UserRole } from "@prisma/client";
import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/session";
import { listScheduleForUser } from "@/lib/repositories/schedule-repository";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Portal Schedule",
  description: "Class calendar and live lesson links.",
};

type SchedulePageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

function getMonthRange(monthValue?: string) {
  const now = new Date();
  const monthDate = monthValue ? new Date(`${monthValue}-01T00:00:00`) : now;
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  return { start, end };
}

function formatMonth(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
  const classes = await listScheduleForUser(session.uid, session.role, start, end);

  const grouped = new Map<string, typeof classes>();
  for (const item of classes) {
    const key = new Date(item.startAt).toISOString().slice(0, 10);
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }

  return (
    <div className="space-y-4">
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
            Showing classes for {formatDateLabel(start)} - {formatDateLabel(new Date(end.getTime() - 1))}
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
                        {formatTime(new Date(item.startAt))} - {formatTime(new Date(item.endAt))}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Teacher: {item.teacher?.fullName || "TBA"}
                      </p>
                    </div>
                    <Button asChild size="sm">
                      <a href={item.liveLessonUrl} target="_blank" rel="noreferrer">
                        Join Live Lesson
                      </a>
                    </Button>
                  </div>
                </article>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
