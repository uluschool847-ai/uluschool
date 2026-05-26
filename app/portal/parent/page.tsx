import { UserRole } from "@prisma/client";
import Link from "next/link";
import type { ReactNode } from "react";

import { requireRole } from "@/lib/auth/session";
import { countUnreadNotificationsForUser } from "@/lib/repositories/notification-repository";
import { getParentDashboardData } from "@/lib/repositories/parent-dashboard-repository";

type DashboardData = Awaited<ReturnType<typeof getParentDashboardData>>;
type DashboardChild = DashboardData["children"][number];
type QuickLink = DashboardChild["quickLinks"][number];

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

function EmptyStatus({ label, children }: { label: string; children: ReactNode }) {
  return (
    <output aria-label={label} className="text-sm text-gray-500">
      {children}
    </output>
  );
}

function ProfileCard({ unreadNotifications }: { unreadNotifications: number }) {
  return (
    <section
      aria-label="Parent profile"
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
        <Link
          className="text-sm font-medium text-blue-700 hover:underline"
          href="/portal/parent/profile"
        >
          Open profile
        </Link>
      </div>
      <p className="text-sm text-gray-700">Account and linked children overview.</p>
      <p className="text-sm text-gray-700">Unread notifications: {unreadNotifications}</p>
      <Link
        className="text-sm font-medium text-blue-700 hover:underline"
        href="/portal/parent/notifications"
      >
        Open notifications
      </Link>
    </section>
  );
}

function SummaryCard({
  childName,
  children,
  heading,
  link,
}: {
  childName: string;
  children: ReactNode;
  heading: string;
  link: QuickLink | null;
}) {
  return (
    <section
      aria-label={`${childName} ${heading}`}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">{heading}</h2>
        {link ? (
          <Link className="text-sm font-medium text-blue-700 hover:underline" href={link.href}>
            {link.label}
          </Link>
        ) : null}
      </div>
      <div className="space-y-2 text-sm text-gray-700">{children}</div>
    </section>
  );
}

function ChildDashboard({ child }: { child: DashboardChild }) {
  const childName = child.childName ?? child.fullName;
  const quickLinks = child.quickLinks ?? [];
  const nextLessonDate = formatDate(child.scheduleSummary.nextLesson?.startAt);
  const nextAssignmentDate = formatDate(child.assignmentsSummary.nextPending?.dueDate);
  const progressDate = formatDate(child.progressSummary.latestNote?.recordedAt);
  const reportDate = formatDate(child.reportsSummary.latestReport?.generatedAt);

  return (
    <section
      aria-label={`Dashboard for ${childName}`}
      className="space-y-6 border-b border-gray-100 pb-10 last:border-0"
    >
      <header className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{childName}</h2>
        <p className="text-sm text-gray-500">Linked child academic summary</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          childName={childName}
          heading="Schedule"
          link={sectionLink(quickLinks, "Open schedule")}
        >
          {child.scheduleSummary.nextLesson ? (
            <>
              <p>
                Next lesson:{" "}
                <span className="font-medium">{child.scheduleSummary.nextLesson.title}</span>
              </p>
              {nextLessonDate ? <p>Lesson date: {nextLessonDate}</p> : null}
              {child.scheduleSummary.nextLesson.subjectName ? (
                <p>Subject: {child.scheduleSummary.nextLesson.subjectName}</p>
              ) : null}
              {child.scheduleSummary.nextLesson.classGroupName ? (
                <p>Group: {child.scheduleSummary.nextLesson.classGroupName}</p>
              ) : null}
              <p>Upcoming lessons: {child.scheduleSummary.upcomingCount}</p>
            </>
          ) : (
            <EmptyStatus label="Schedule">No upcoming lessons.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard
          childName={childName}
          heading="Assignments"
          link={sectionLink(quickLinks, "Open assignments")}
        >
          {child.assignmentsSummary.pendingCount > 0 ? (
            <>
              <p>Pending assignments: {child.assignmentsSummary.pendingCount}</p>
              <p>Recently graded: {child.assignmentsSummary.recentGradedCount}</p>
              {child.assignmentsSummary.nextPending ? (
                <>
                  <p>
                    Next assignment:{" "}
                    <span className="font-medium">
                      {child.assignmentsSummary.nextPending.title}
                    </span>
                  </p>
                  {nextAssignmentDate ? <p>Due date: {nextAssignmentDate}</p> : null}
                </>
              ) : null}
            </>
          ) : (
            <>
              <p>Recently graded: {child.assignmentsSummary.recentGradedCount}</p>
              {child.assignmentsSummary.latestGraded ? (
                <p>
                  Recently graded assignment:{" "}
                  <span className="font-medium">{child.assignmentsSummary.latestGraded.title}</span>
                </p>
              ) : null}
              <EmptyStatus label="Assignments">No pending assignments.</EmptyStatus>
            </>
          )}
        </SummaryCard>

        <SummaryCard
          childName={childName}
          heading="Materials"
          link={sectionLink(quickLinks, "Open materials")}
        >
          {child.materialsSummary.totalCount > 0 ? (
            <>
              <p>Materials: {child.materialsSummary.totalCount}</p>
              {child.materialsSummary.latestMaterial ? (
                <p>
                  Latest material:{" "}
                  <span className="font-medium">{child.materialsSummary.latestMaterial.title}</span>
                </p>
              ) : null}
            </>
          ) : (
            <EmptyStatus label="Materials">No materials available yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard
          childName={childName}
          heading="Attendance"
          link={sectionLink(quickLinks, "Open attendance")}
        >
          {child.attendanceSummary && child.attendanceSummary.totalCount > 0 ? (
            <p>
              Attendance rate:{" "}
              {child.attendanceSummary.attendanceRate === null
                ? "No attendance rate yet"
                : `${child.attendanceSummary.attendanceRate}%`}
              {"; "}Present: {child.attendanceSummary.presentCount}; Late:{" "}
              {child.attendanceSummary.lateCount}
              {"; "}Absent: {child.attendanceSummary.absentCount}
            </p>
          ) : (
            <EmptyStatus label="Attendance">No attendance records yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard
          childName={childName}
          heading="Progress"
          link={sectionLink(quickLinks, "Open progress")}
        >
          {child.progressSummary.latestNote ? (
            <>
              {child.progressSummary.latestNote.subjectName ? (
                <p>Subject: {child.progressSummary.latestNote.subjectName}</p>
              ) : null}
              <p>Latest note: {child.progressSummary.latestNote.content}</p>
              {progressDate ? <p>Recorded date: {progressDate}</p> : null}
            </>
          ) : (
            <EmptyStatus label="Progress">No progress notes yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard
          childName={childName}
          heading="Gradebook"
          link={sectionLink(quickLinks, "Open gradebook")}
        >
          {child.gradebookSummary.currentTermAverage === null ? (
            <EmptyStatus label="Gradebook">No grade average yet.</EmptyStatus>
          ) : (
            <p>Grade average: {child.gradebookSummary.currentTermAverage}</p>
          )}
        </SummaryCard>

        <SummaryCard
          childName={childName}
          heading="Reports"
          link={sectionLink(quickLinks, "Open reports")}
        >
          {child.reportsSummary.latestReport ? (
            <>
              <p>Latest report: {child.reportsSummary.latestReport.termName}</p>
              <p>
                Report average:{" "}
                {child.reportsSummary.latestReport.weightedTermAverage ?? "No report average"}
              </p>
              {reportDate ? <p>Report date: {reportDate}</p> : null}
            </>
          ) : (
            <EmptyStatus label="Reports">No reports available yet.</EmptyStatus>
          )}
        </SummaryCard>

        <SummaryCard
          childName={childName}
          heading="Billing"
          link={sectionLink(quickLinks, "Open billing")}
        >
          <p>View KES invoices, receipts, subscriptions, and M-Pesa payment status.</p>
        </SummaryCard>
      </div>
    </section>
  );
}

export default async function ParentPortalPage() {
  const session = await requireRole([UserRole.PARENT]);
  const [dashboard, unreadNotifications] = await Promise.all([
    getParentDashboardData(session.uid),
    countUnreadNotificationsForUser(session.uid),
  ]);

  if (dashboard.children.length === 0) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-8 text-center">
        <h1 className="text-2xl font-bold">Parent Dashboard</h1>
        <ProfileCard unreadNotifications={unreadNotifications} />
        <output className="block text-gray-500">
          No linked students found. Please contact administration.
        </output>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Parent Dashboard</h1>
        <p className="text-gray-500">
          Track linked child classes, assignments, materials, attendance, progress, grades, and
          reports.
        </p>
      </header>

      <ProfileCard unreadNotifications={unreadNotifications} />

      {dashboard.children.map((child) => (
        <ChildDashboard key={child.id} child={child} />
      ))}
    </main>
  );
}
