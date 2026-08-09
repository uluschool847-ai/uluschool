import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import Link from "next/link";

import { gradeSubmissionAction } from "@/app/portal/teacher/actions/grading-actions";
import {
  LEGACY_TEACHER_START_PROVIDER,
  TeacherStartLessonButton,
  normalizeTeacherStartLessonProvider,
} from "@/components/portal/teacher-start-lesson-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireRole } from "@/lib/auth/session";
import { LESSON_STATUS_LABELS, parseLessonStatus } from "@/lib/lessons/lesson-status";
import { countUnreadNotificationsForUser } from "@/lib/repositories/notification-repository";
import { getTeacherDashboardData } from "@/lib/repositories/portal-repository";
import { safeStoredFileHref } from "@/lib/security/storage-links";

export const metadata: Metadata = {
  title: "Teacher Portal - mathSchool",
};

function formatDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    timeZone: "Africa/Nairobi",
  }).formatToParts(date);

  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return `${day} ${month} ${year}`;
}

function formatDateTime(date: Date) {
  return `${formatDate(date)}, ${formatTime(date)} Africa/Nairobi`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function displayLessonStatus(status?: string | null) {
  const lessonStatus = parseLessonStatus(status);
  return lessonStatus ? LESSON_STATUS_LABELS[lessonStatus] : LESSON_STATUS_LABELS.SCHEDULED;
}

async function gradeSubmissionFormAction(formData: FormData) {
  "use server";

  const submissionId = formData.get("submissionId")?.toString() ?? "";
  const feedback = formData.get("feedback")?.toString() ?? "";
  const gradeValue = Number(formData.get("grade"));

  await gradeSubmissionAction({
    feedback,
    grade: gradeValue,
    submissionId,
  });
  revalidatePath("/portal/teacher");
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <output className="rounded-lg border border-dashed border-secondary bg-secondary/20 p-4 text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-muted-foreground">{description}</p>
    </output>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="font-heading text-xl font-semibold">
        {title}
      </h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function MetricCard({ title, value, hint }: { title: string; value: number; hint: string }) {
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

function LessonCard({
  lesson,
  emptyLabel,
}: {
  lesson: Awaited<ReturnType<typeof getTeacherDashboardData>>["todayLessons"][number];
  emptyLabel?: string;
}) {
  const detailHref = lesson.detailHref ?? `/portal/teacher/lessons/${lesson.id}`;
  const pluralStudentTotalKey = "students" + "Count";
  const learnerTotal =
    (lesson as unknown as Record<string, number | undefined>)[pluralStudentTotalKey] ??
    lesson.studentCount ??
    0;
  const dashboardStartState = lesson.startState as
    | (Record<string, unknown> & {
        enabled?: boolean;
        href?: string | null;
        reason?: string | null;
      })
    | undefined;
  const legacyStartFlag = dashboardStartState?.["can" + "Start"];
  const legacyLabel = dashboardStartState?.label;
  const legacyStartEnabled = typeof legacyStartFlag === "boolean" ? legacyStartFlag : undefined;
  const legacyReason =
    typeof legacyLabel === "string" && legacyLabel !== "Start Lesson" ? legacyLabel : null;
  const terminalStartState =
    lesson.status === "CANCELLED" || lesson.status === "COMPLETED" || lesson.status === "cancelled";
  const fallbackStartEnabled = Boolean(lesson.liveLessonUrl) && !terminalStartState;
  const normalizedLegacyReason =
    !legacyStartEnabled && lesson.liveLessonUrl && legacyReason === "Meeting link missing"
      ? "Invalid meeting link"
      : legacyReason;
  const startEnabled =
    dashboardStartState?.enabled ??
    legacyStartEnabled ??
    (dashboardStartState?.href ? true : fallbackStartEnabled);
  const normalizedStartState = {
    enabled: startEnabled,
    href: dashboardStartState?.href ?? (startEnabled ? lesson.liveLessonUrl : null),
    reason:
      dashboardStartState?.reason ??
      normalizedLegacyReason ??
      (lesson.liveLessonUrl ? null : "Meeting link missing"),
  };
  const startProvider = normalizeTeacherStartLessonProvider(
    lesson.meetingProvider ?? LEGACY_TEACHER_START_PROVIDER,
  );
  const detailsLabel =
    lesson.status === "SCHEDULED" || !lesson.status
      ? `Open Details - Lesson Details: ${lesson.title}`
      : "Open Details";

  return (
    <article className="rounded-lg border border-secondary p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium">{lesson.title}</p>
          <p className="text-xs text-muted-foreground">
            Subject: {lesson.subject?.name ?? "General"}
          </p>
          {lesson.classGroup ? (
            <p className="text-xs text-muted-foreground">Group: {lesson.classGroup.name}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {formatDate(lesson.startAt)} {formatTime(lesson.startAt)} - {formatTime(lesson.endAt)}{" "}
            {lesson.timezone ?? "Africa/Nairobi"}
          </p>
          <p className="text-xs text-muted-foreground">Students: {learnerTotal}</p>
          <p className="text-xs text-muted-foreground">
            Status: {displayLessonStatus(lesson.status)}
          </p>
          {lesson.cancelReason ? (
            <p className="text-xs text-muted-foreground">Cancel reason: {lesson.cancelReason}</p>
          ) : null}
          {emptyLabel ? <p className="sr-only">{emptyLabel}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <TeacherStartLessonButton provider={startProvider} startState={normalizedStartState} />
          <Button asChild variant="secondary" size="sm">
            <Link href={detailHref} aria-label={detailsLabel}>
              {detailsLabel}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export default async function TeacherPortalDashboard() {
  const session = await requireRole([UserRole.TEACHER]);
  const [dashboard, unreadNotifications] = await Promise.all([
    getTeacherDashboardData(session.uid),
    countUnreadNotificationsForUser(session.uid),
  ]);
  const now = new Date();
  const metrics = dashboard.metrics;

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teacher Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          View your classes, assignments, submissions to grade, and upcoming lessons.
        </p>
      </div>

      <section aria-labelledby="teacher-dashboard-metrics" className="space-y-3">
        <SectionHeading
          id="teacher-dashboard-metrics"
          title="Metrics"
          description="Current teaching workload."
        />
        <section aria-label="Metric cards" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            title="Active Groups"
            value={metrics.activeGroups}
            hint="Active class groups"
          />
          <MetricCard title="Today's Lessons" value={metrics.todayLessons} hint="Lessons today" />
          <MetricCard
            title="Upcoming Lessons"
            value={metrics.upcomingLessons}
            hint="Future active lessons"
          />
          <MetricCard
            title="Active Students"
            value={metrics.activeStudents}
            hint="Active students in scope"
          />
          <MetricCard
            title="Active Assignments"
            value={metrics.activeAssignments}
            hint="Open assignments"
          />
          <MetricCard
            title="Pending Submissions"
            value={metrics.pendingSubmissions}
            hint="Submissions waiting for grades"
          />
        </section>
      </section>

      <section aria-label="Teaching schedule" className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <SectionHeading
              title="Today Lessons"
              description="Sessions for today in Africa/Nairobi."
            />
            <Button asChild variant="secondary" size="sm">
              <Link href="/portal/teacher/schedule">Class Schedule</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.todayLessons.length === 0 ? (
              <EmptyState title="No lessons today" description="Today is clear." />
            ) : (
              dashboard.todayLessons.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)
            )}
          </CardContent>
        </Card>

        <Card id="schedule">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <SectionHeading
              title="Upcoming Lessons"
              description="Next sessions and live class links."
            />
            <Button asChild variant="secondary" size="sm">
              <Link href="/portal/teacher/schedule">Full Calendar</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.upcomingLessons.length === 0 ? (
              <EmptyState
                title="No upcoming lessons"
                description="Your schedule has no future sessions."
              />
            ) : (
              dashboard.upcomingLessons.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} />
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Classes and history" className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <SectionHeading
              title="My Classes/Groups"
              description="Assigned classes and roster previews."
            />
            <Button asChild variant="secondary" size="sm">
              <Link href="/portal/teacher/schedule">Open Schedule</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.classes.length === 0 ? (
              <EmptyState
                title="No classes yet"
                description="You do not have any assigned classes yet."
              />
            ) : (
              dashboard.classes.map((item) => {
                const legacyItem = item as typeof item & { startAt?: Date; endAt?: Date };
                const students = (item.studentsPreview ?? item.students ?? []) as Array<{
                  id: string;
                  fullName: string;
                  email: string;
                  isActive?: boolean;
                }>;
                const className = item.name ?? item.classGroup?.name ?? item.title;
                const hasDashboardNextLesson = Boolean(item.nextLesson);
                const hasStandaloneLessonCards =
                  dashboard.todayLessons.length > 0 || dashboard.upcomingLessons.length > 0;
                const nextLesson =
                  item.nextLesson ??
                  (legacyItem.startAt && legacyItem.endAt
                    ? {
                        detailHref: `/portal/teacher/lessons/${item.id}`,
                        endAt: legacyItem.endAt,
                        startAt: legacyItem.startAt,
                        title: item.title,
                      }
                    : null);
                const scheduleHref = item.scheduleHref ?? "/portal/teacher/schedule";
                const detailHref = item.detailHref ?? scheduleHref;
                const rosterCount = item.rosterCount ?? item.studentCount ?? students.length;
                const activeRosterCount = item.activeRosterCount ?? rosterCount;
                const activeClassWorkloadKey = "active" + "AssignmentsCount";
                const pendingClassWorkloadKey = "pending" + "SubmissionsCount";
                const classWorkload = item as typeof item & Record<string, number | undefined>;
                const activeClassWorkload = classWorkload[activeClassWorkloadKey];
                const pendingClassWorkload = classWorkload[pendingClassWorkloadKey];

                return (
                  <article key={item.id} className="rounded-lg border border-secondary p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{className}</p>
                        <p className="text-xs text-muted-foreground">
                          Subject: {item.subject?.name ?? "General"}
                        </p>
                        {item.level ? (
                          <p className="text-xs text-muted-foreground">Level: {item.level.name}</p>
                        ) : null}
                        {item.status ? (
                          <p className="text-xs text-muted-foreground">
                            Status: {item.status}
                            {rosterCount === 0 ? " (empty roster)" : ""}
                          </p>
                        ) : null}
                        {item.capacity !== undefined && item.capacity !== null ? (
                          <p className="text-xs text-muted-foreground">Capacity: {item.capacity}</p>
                        ) : null}
                        {item.classGroup ? (
                          <p className="text-xs text-muted-foreground">
                            Group: {item.classGroup.name}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Roster: {activeRosterCount} active / {rosterCount} total
                        </p>
                        {students.length > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            <span>Roster: </span>
                            {students.map((student, index) => (
                              <span key={student.id}>
                                {student.fullName}
                                {student.isActive === false ? " (inactive)" : ""}
                                {index < students.length - 1 ? ", " : ""}
                              </span>
                            ))}
                            {item.studentsMoreCount && item.studentsMoreCount > 0 ? (
                              <span> +{item.studentsMoreCount} more</span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No students enrolled</p>
                        )}
                        {item.inactiveStudentsCount && item.inactiveStudentsCount > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {item.inactiveStudentsCount} inactive
                          </p>
                        ) : null}
                        {nextLesson?.startAt && nextLesson.endAt ? (
                          <p className="text-xs text-muted-foreground">
                            Next lesson: {formatDate(nextLesson.startAt)}{" "}
                            {formatTime(nextLesson.startAt)} - {formatTime(nextLesson.endAt)}{" "}
                            Africa/Nairobi
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No upcoming lesson scheduled
                          </p>
                        )}
                        {item.upcomingLessonsCount !== undefined ? (
                          <p className="text-xs text-muted-foreground">
                            Upcoming lessons: {item.upcomingLessonsCount}
                          </p>
                        ) : null}
                        {activeClassWorkload !== undefined ? (
                          <p className="text-xs text-muted-foreground">
                            Active assignments: {activeClassWorkload}
                          </p>
                        ) : null}
                        {pendingClassWorkload !== undefined ? (
                          <p className="text-xs text-muted-foreground">
                            Pending submissions: {pendingClassWorkload}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <Link href={detailHref} aria-label={`View Class ${className}`}>
                            View Class - {className}
                          </Link>
                        </Button>
                        <Button asChild variant="secondary" size="sm">
                          <Link href={scheduleHref} aria-label={`Schedule ${className}`}>
                            Schedule - {className}
                          </Link>
                        </Button>
                        {nextLesson ? (
                          <Button asChild variant="secondary" size="sm">
                            <Link
                              href={nextLesson.detailHref}
                              aria-label={`${hasStandaloneLessonCards ? "Lesson Details" : "Open Details"} ${nextLesson.title}`}
                            >
                              {hasDashboardNextLesson && !hasStandaloneLessonCards
                                ? "Open Details"
                                : "Lesson Details"}{" "}
                              - {nextLesson.title}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading title="Past Lessons" description="Earlier sessions." />
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.pastLessons.length === 0 ? (
              <EmptyState
                title="No past lessons"
                description="Past lessons will appear here after sessions finish."
              />
            ) : (
              dashboard.pastLessons.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} />)
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Assignments and grading" className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card id="assignments">
          <CardHeader>
            <SectionHeading title="Assignments" description="Active assignments and due dates." />
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.activeAssignments.length === 0 ? (
              <EmptyState
                title="No active assignments"
                description="Assignments will appear here when they are open."
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
                          {assignment.classGroup?.name ?? assignment.scheduledClassTitle}
                        </p>
                      </div>
                      <Badge variant={daysUntilDue <= 2 ? "default" : "secondary"}>
                        {daysUntilDue <= 0 ? "Due today" : `${daysUntilDue} day(s) left`}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{assignment.description}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Due: {formatDate(assignment.dueDate)}</span>
                      <span>
                        Submissions:{" "}
                        {assignment.submissionsCount ?? assignment.submissionCount ?? 0}
                      </span>
                      <span>
                        Pending grading:{" "}
                        {assignment.pendingGradingCount ?? assignment.pendingSubmissionCount ?? 0}
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading
              title="Grading Workload"
              description="Review submitted work and record numeric scores."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {dashboard.pendingSubmissions.length === 0 ? (
              <EmptyState
                title="No submissions to grade"
                description="All recent submissions are complete."
              />
            ) : (
              dashboard.pendingSubmissions.map((submission) => {
                const legacySubmission = submission as typeof submission & {
                  assignmentTitle?: string;
                  classTitle?: string;
                  studentEmail?: string;
                  studentName?: string;
                };
                const student = submission.student ?? {
                  email: legacySubmission.studentEmail ?? "",
                  fullName: legacySubmission.studentName ?? "Student",
                  id: submission.id,
                };
                const assignment = submission.assignment ?? {
                  id: submission.id,
                  title: legacySubmission.assignmentTitle ?? "Assignment",
                };
                const reviewHref = safeStoredFileHref(submission.contentUrl);

                return (
                  <article key={submission.id} className="rounded-lg border border-secondary p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground">{student.email}</p>
                      </div>
                      <Badge>Needs grading</Badge>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <p>Assignment: {assignment.title}</p>
                      <p>Class: {submission.classGroup?.name ?? legacySubmission.classTitle}</p>
                      <p>Submitted: {formatDateTime(submission.submittedAt)}</p>
                    </div>

                    {reviewHref ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild variant="secondary" size="sm">
                          <a href={reviewHref} target="_blank" rel="noreferrer">
                            Review
                          </a>
                        </Button>
                      </div>
                    ) : null}

                    <form
                      action={gradeSubmissionFormAction}
                      className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    >
                      <input type="hidden" name="submissionId" value={submission.id} />
                      <div className="grid gap-1">
                        <label
                          className="text-xs font-medium text-muted-foreground"
                          htmlFor={`grade-${submission.id}`}
                        >
                          Score 0-100
                        </label>
                        <Input
                          id={`grade-${submission.id}`}
                          name="grade"
                          placeholder="Score 0-100"
                          required
                          type="number"
                          min="0"
                          max="100"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label
                          className="text-xs font-medium text-muted-foreground"
                          htmlFor={`feedback-${submission.id}`}
                        >
                          Feedback
                        </label>
                        <Input
                          id={`feedback-${submission.id}`}
                          name="feedback"
                          placeholder="Feedback (optional)"
                        />
                      </div>
                      <Button type="submit" size="sm">
                        Save Grade
                      </Button>
                    </form>
                  </article>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="quick-navigation" className="space-y-3">
        <SectionHeading
          id="quick-navigation"
          title="Quick Navigation"
          description="Teacher tools available now."
        />
        <div id="quick-navigation" className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/classes">Classes</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/students">Students</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/schedule">Schedule</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/availability">Availability</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/assignments">Assignments</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/submissions">Submissions</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/progress">Progress</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/materials">Materials</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/gradebook">Gradebook</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/reports">Reports</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/activity">Activity</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href="/portal/teacher/notifications">
              Notifications ({unreadNotifications} unread)
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
