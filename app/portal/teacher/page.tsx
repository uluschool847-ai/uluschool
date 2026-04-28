import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";

import { gradeHomeworkAction } from "@/app/portal/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireRole } from "@/lib/auth/session";
import { getTeacherDashboardData } from "@/lib/repositories/portal-repository";

export const metadata: Metadata = {
  title: "Teacher Portal - mathSchool",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMonth(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function inferSubjectOrLevel(title: string) {
  const [subjectOrLevel] = title.split("-");
  return subjectOrLevel?.trim() || "General";
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-secondary bg-secondary/20 p-4 text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-muted-foreground">{description}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default async function TeacherPortalDashboard() {
  const session = await requireRole([UserRole.TEACHER]);
  const dashboard = await getTeacherDashboardData(session.uid);
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teacher Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          View your classes, assignments, submissions to grade, and upcoming lessons.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="My Classes"
          value={dashboard.metrics.myClasses}
          hint="Assigned class sessions"
        />
        <MetricCard
          title="Active Assignments"
          value={dashboard.metrics.activeAssignments}
          hint="Assignments currently open"
        />
        <MetricCard
          title="Pending Submissions"
          value={dashboard.metrics.pendingSubmissions}
          hint="Submissions waiting for grades"
        />
        <MetricCard
          title="Upcoming Lessons"
          value={dashboard.metrics.upcomingLessons}
          hint="Scheduled lessons ahead"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>My Classes</CardTitle>
              <CardDescription>Assigned classes and quick access to details.</CardDescription>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/portal/schedule">Open Schedule</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.classes.length === 0 ? (
              <EmptyState
                title="No classes assigned"
                description="You do not have any assigned classes yet."
              />
            ) : (
              dashboard.classes.map((item) => (
                <article key={item.id} className="rounded-lg border border-secondary p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Subject/Level: {inferSubjectOrLevel(item.title)}
                      </p>
                      <p className="text-xs text-muted-foreground">Students: {item.studentCount}</p>
                      <p className="text-xs text-muted-foreground">
                        Next slot: {formatDate(item.startAt)} {formatTime(item.startAt)} -{" "}
                        {formatTime(item.endAt)}
                      </p>
                    </div>
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/portal/schedule?month=${formatMonth(item.startAt)}`}>
                        View Class
                      </Link>
                    </Button>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <Card id="schedule">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Upcoming Lessons</CardTitle>
              <CardDescription>Next sessions and live class links.</CardDescription>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/portal/schedule">Full Calendar</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.upcomingLessons.length === 0 ? (
              <EmptyState
                title="No upcoming lessons"
                description="There are no upcoming lessons on your schedule."
              />
            ) : (
              dashboard.upcomingLessons.map((lesson) => (
                <article key={lesson.id} className="rounded-lg border border-secondary p-4">
                  <p className="font-medium">{lesson.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(lesson.startAt)} {formatTime(lesson.startAt)} -{" "}
                    {formatTime(lesson.endAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">Students: {lesson.studentCount}</p>
                  <div className="mt-3">
                    <Button asChild size="sm">
                      <a href={lesson.liveLessonUrl} target="_blank" rel="noreferrer">
                        Join Lesson
                      </a>
                    </Button>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card id="assignments">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="space-y-1">
              <CardTitle>Assignments</CardTitle>
              <CardDescription>Active assignments and grading workload.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled
                title="Assignment creation will be added next"
              >
                Create Assignment
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/portal/teacher#assignments">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.activeAssignments.length === 0 ? (
              <EmptyState
                title="No active assignments"
                description="You have no active assignments right now."
              />
            ) : (
              dashboard.activeAssignments.map((assignment) => {
                const daysUntilDue = Math.ceil(
                  (new Date(assignment.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
                );

                return (
                  <article key={assignment.id} className="rounded-lg border border-secondary p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{assignment.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.scheduledClassTitle}
                        </p>
                      </div>
                      <Badge variant={daysUntilDue <= 2 ? "default" : "secondary"}>
                        {daysUntilDue <= 0 ? "Due today" : `${daysUntilDue} day(s) left`}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{assignment.description}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Due: {formatDate(assignment.dueDate)}</span>
                      <span>Submissions: {assignment.submissionCount}</span>
                      <span>Pending grading: {assignment.pendingSubmissionCount}</span>
                    </div>
                  </article>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Submissions to Grade</CardTitle>
            <CardDescription>
              Review submitted work and record a grade directly from this dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.recentPendingSubmissions.length === 0 ? (
              <EmptyState
                title="No submissions to grade"
                description="All recent submissions are graded."
              />
            ) : (
              dashboard.recentPendingSubmissions.map((submission) => (
                <article key={submission.id} className="rounded-lg border border-secondary p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{submission.studentName}</p>
                      <p className="text-xs text-muted-foreground">{submission.studentEmail}</p>
                    </div>
                    <Badge>Needs grading</Badge>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>Assignment: {submission.assignmentTitle}</p>
                    <p>Class: {submission.classTitle}</p>
                    <p>Submitted: {formatDateTime(submission.submittedAt)}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild variant="secondary" size="sm">
                      <a href={submission.contentUrl} target="_blank" rel="noreferrer">
                        Review Work
                      </a>
                    </Button>
                  </div>

                  <form
                    action={gradeHomeworkAction}
                    className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input type="hidden" name="submissionId" value={submission.id} />
                    <Input name="grade" placeholder="Grade (e.g. A, 82%)" required />
                    <Input name="feedback" placeholder="Feedback (optional)" />
                    <Button type="submit" size="sm">
                      Save Grade
                    </Button>
                  </form>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
