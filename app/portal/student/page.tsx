import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { countUnreadNotificationsForUser } from "@/lib/repositories/notification-repository";
import { getStudentDashboardData } from "@/lib/repositories/student-dashboard-repository";

export const metadata: Metadata = {
  title: "Student Portal - mathSchool",
};

type DashboardData = Awaited<ReturnType<typeof getStudentDashboardData>>;
type QuickLink =
  | DashboardData["quickLinks"][number]
  | {
      href: string;
      label: string;
    };

const fallbackQuickLinks: QuickLink[] = [
  { href: "/portal/student/schedule", label: "Open schedule" },
  { href: "/portal/student/assignments", label: "Open assignments" },
  { href: "/portal/student/materials", label: "Open materials" },
  { href: "/portal/student/attendance", label: "Open attendance" },
  { href: "/portal/student/progress", label: "Open progress" },
  { href: "/portal/student/gradebook", label: "Open gradebook" },
  { href: "/portal/student/reports", label: "Open reports" },
  { href: "/portal/student/profile", label: "Open profile" },
];

function formatDate(date: Date | string | null | undefined) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).formatToParts(value);

  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return `${day} ${month} ${year}`;
}

function sectionLink(links: QuickLink[], label: QuickLink["label"]) {
  return links.find((link) => link.label === label) ?? null;
}

function SummaryCard({
  children,
  heading,
  link,
}: {
  children: ReactNode;
  heading: string;
  link: QuickLink | null;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-heading text-xl font-semibold">{heading}</h2>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {children}
        {link ? (
          <Link className="inline-flex font-medium text-primary" href={link.href}>
            {link.label}
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyStatus({ label, children }: { label: string; children: ReactNode }) {
  return (
    <output aria-label={label} className="text-muted-foreground">
      {children}
    </output>
  );
}

export default async function StudentPortalDashboard() {
  const session = await requireRole([UserRole.STUDENT]);
  const [dashboard, unreadNotifications] = await Promise.all([
    getStudentDashboardData(session.uid),
    countUnreadNotificationsForUser(session.uid),
  ]);
  const quickLinks: QuickLink[] = [
    ...((dashboard.quickLinks ?? fallbackQuickLinks) as QuickLink[]),
  ];
  if (!quickLinks.some((link) => link.href === "/portal/student/notifications")) {
    quickLinks.push({ href: "/portal/student/notifications", label: "Open notifications" });
  }
  const attendanceSummary = dashboard.attendanceSummary ?? {
    absentCount: 0,
    attendanceRate: null,
    lateCount: 0,
    presentCount: 0,
    totalCount: 0,
  };
  const nextLessonDate = formatDate(dashboard.scheduleSummary.nextLesson?.startAt);
  const nextAssignmentDate = formatDate(dashboard.assignmentsSummary.nextPending?.dueDate);
  const progressDate = formatDate(dashboard.progressSummary.latestNote?.recordedAt);
  const reportDate = formatDate(dashboard.reportsSummary.latestReport?.generatedAt);

  return (
    <main className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {dashboard.student.fullName ?? session.email}. Use this hub to open your
          current student workflows.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard heading="Schedule" link={sectionLink(quickLinks, "Open schedule")}>
          {dashboard.scheduleSummary.nextLesson ? (
            <div className="space-y-2">
              <p>
                Next lesson:{" "}
                <span className="font-medium">{dashboard.scheduleSummary.nextLesson.title}</span>
              </p>
              {nextLessonDate ? <p>Lesson date: {nextLessonDate}</p> : null}
              {dashboard.scheduleSummary.nextLesson.subjectName ? (
                <p>Subject: {dashboard.scheduleSummary.nextLesson.subjectName}</p>
              ) : null}
              <p>Upcoming lessons: {dashboard.scheduleSummary.upcomingCount}</p>
            </div>
          ) : (
            <EmptyStatus label="Schedule">No upcoming lessons.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard heading="Assignments" link={sectionLink(quickLinks, "Open assignments")}>
          <p className="sr-only">My Assignments</p>
          {dashboard.assignmentsSummary.pendingCount > 0 ? (
            <div className="space-y-2">
              <p>Pending assignments: {dashboard.assignmentsSummary.pendingCount}</p>
              {dashboard.assignmentsSummary.overdueCount > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <p>
                    {dashboard.assignmentsSummary.overdueCount} overdue{" "}
                    {dashboard.assignmentsSummary.overdueCount === 1 ? "assignment" : "assignments"}
                  </p>
                  <p>Reminder: This assignment is overdue. Submit it as soon as possible.</p>
                  {dashboard.assignmentsSummary.nextOverdue ? (
                    <p>
                      Overdue assignment:{" "}
                      <Link
                        className="font-medium text-primary"
                        href={dashboard.assignmentsSummary.nextOverdue.href}
                      >
                        {dashboard.assignmentsSummary.nextOverdue.title}
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p>Recently graded: {dashboard.assignmentsSummary.recentGradedCount}</p>
              {dashboard.assignmentsSummary.nextPending ? (
                <>
                  <p>
                    Next assignment:{" "}
                    <span className="font-medium">
                      {dashboard.assignmentsSummary.nextPending.title}
                    </span>
                  </p>
                  {nextAssignmentDate ? <p>Due date: {nextAssignmentDate}</p> : null}
                </>
              ) : null}
            </div>
          ) : (
            <>
              <p>Recently graded: {dashboard.assignmentsSummary.recentGradedCount}</p>
              {dashboard.assignmentsSummary.latestGraded ? (
                <p>
                  Recently graded assignment:{" "}
                  <span className="font-medium">
                    {dashboard.assignmentsSummary.latestGraded.title}
                  </span>
                </p>
              ) : null}
              <EmptyStatus label="Assignments">No pending assignments.</EmptyStatus>
            </>
          )}
        </SummaryCard>

        <SummaryCard heading="Materials" link={sectionLink(quickLinks, "Open materials")}>
          {dashboard.materialsSummary.totalCount > 0 ? (
            <div className="space-y-2">
              <p>Materials: {dashboard.materialsSummary.totalCount}</p>
              {dashboard.materialsSummary.latestMaterial ? (
                <p>
                  Latest material:{" "}
                  <span className="font-medium">
                    {dashboard.materialsSummary.latestMaterial.title}
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyStatus label="Materials">No materials available yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard heading="Attendance" link={sectionLink(quickLinks, "Open attendance")}>
          {attendanceSummary.totalCount > 0 ? (
            <div className="space-y-2">
              <p>
                Attendance rate:{" "}
                {attendanceSummary.attendanceRate === null
                  ? "No attendance rate yet"
                  : `${attendanceSummary.attendanceRate}%`}
                {"; "}Present: {attendanceSummary.presentCount}; Late: {attendanceSummary.lateCount}
                {"; "}
                Absent: {attendanceSummary.absentCount}
              </p>
            </div>
          ) : (
            <EmptyStatus label="Attendance">No attendance records yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard heading="Progress" link={sectionLink(quickLinks, "Open progress")}>
          <p className="sr-only">My Progress</p>
          {dashboard.progressSummary.latestNote ? (
            <div className="space-y-2">
              {dashboard.progressSummary.latestNote.subjectName ? (
                <p>Subject: {dashboard.progressSummary.latestNote.subjectName}</p>
              ) : null}
              <p>Latest note: {dashboard.progressSummary.latestNote.content}</p>
              {progressDate ? <p>Recorded date: {progressDate}</p> : null}
            </div>
          ) : (
            <EmptyStatus label="Progress">No progress notes yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard heading="Gradebook" link={sectionLink(quickLinks, "Open gradebook")}>
          {dashboard.gradebookSummary.currentTermAverage === null ? (
            <EmptyStatus label="Gradebook">No grade average yet.</EmptyStatus>
          ) : (
            <div className="space-y-2">
              <p>Grade average: {dashboard.gradebookSummary.currentTermAverage}</p>
            </div>
          )}
        </SummaryCard>

        <SummaryCard heading="Reports" link={sectionLink(quickLinks, "Open reports")}>
          {dashboard.reportsSummary.latestReport ? (
            <div className="space-y-2">
              <p>Latest report: {dashboard.reportsSummary.latestReport.termName}</p>
              <p>
                Report average:{" "}
                {dashboard.reportsSummary.latestReport.weightedTermAverage ?? "No report average"}
              </p>
              {reportDate ? <p>Report date: {reportDate}</p> : null}
            </div>
          ) : (
            <EmptyStatus label="Reports">No reports available yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard heading="Profile" link={sectionLink(quickLinks, "Open profile")}>
          <div className="space-y-2">
            <p>Email: {dashboard.profileSummary?.email ?? dashboard.student.email}</p>
            {dashboard.profileSummary?.membershipLabel ? (
              <p>Membership: {dashboard.profileSummary.membershipLabel}</p>
            ) : (
              <p>Review your student account and class membership.</p>
            )}
          </div>
        </SummaryCard>

        <SummaryCard heading="Notifications" link={sectionLink(quickLinks, "Open notifications")}>
          {unreadNotifications > 0 ? (
            <p>Unread notifications: {unreadNotifications}</p>
          ) : (
            <EmptyStatus label="Notifications">No unread notifications.</EmptyStatus>
          )}
        </SummaryCard>
      </div>
    </main>
  );
}
