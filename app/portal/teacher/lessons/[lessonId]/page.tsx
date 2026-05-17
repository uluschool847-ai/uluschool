import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  TeacherStartLessonButton,
  normalizeTeacherStartLessonProvider,
} from "@/components/portal/teacher-start-lesson-button";
import { requireRole } from "@/lib/auth/session";
import { LESSON_STATUS_LABELS, parseLessonStatus } from "@/lib/lessons/lesson-status";
import {
  type TeacherLessonWorkspace,
  getTeacherLessonWorkspace,
} from "@/lib/repositories/teacher-lesson-workspace-repository";

export const metadata: Metadata = {
  title: "Teacher Lesson Detail",
};

type TeacherLessonDetailPageProps = {
  params: Promise<{ lessonId: string }> | { lessonId: string };
};

function genericLabel(value: string) {
  return value
    .toLowerCase()
    .split("-")
    .join(" ")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lessonStatusLabel(value: string) {
  const status = parseLessonStatus(value);
  return status ? LESSON_STATUS_LABELS[status] : genericLabel(value);
}

function formatDate(date: Date | null) {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Kiev",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kiev",
  }).format(date);
}

function EmptyState({ children }: { children: string }) {
  return <p className="rounded-md border border-dashed p-3 text-sm">{children}</p>;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label={title}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function LessonHeader({ workspace }: { workspace: TeacherLessonWorkspace }) {
  const { lesson } = workspace;

  return (
    <header className="space-y-4">
      <h1 className="text-3xl font-bold">{lesson.title}</h1>
      {lesson.description ? <p>{lesson.description}</p> : null}

      <Section title="Lesson Header">
        <div className="grid gap-1 text-sm md:grid-cols-2">
          <p>Subject: {workspace.subject?.name ?? "General"}</p>
          <p>Class group: {workspace.classGroup?.name ?? "No class group"}</p>
          <p>Status: {lessonStatusLabel(String(lesson.status))}</p>
          <p>Timezone: {lesson.timezone}</p>
          <p>
            Date/time: {formatDate(lesson.startAt)} {formatTime(lesson.startAt)} -{" "}
            {formatTime(lesson.endAt)}
          </p>
          {lesson.isRescheduled && lesson.rescheduledFromId ? (
            <p>Rescheduled from {lesson.rescheduledFromId}</p>
          ) : null}
          {lesson.cancelReason ? <p>Cancel reason: {lesson.cancelReason}</p> : null}
        </div>
      </Section>
    </header>
  );
}

function LessonActions({ workspace }: { workspace: TeacherLessonWorkspace }) {
  const classDetail = workspace.navigationHrefs.classDetail;

  return (
    <Section title="Lesson Actions">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={workspace.navigationHrefs.backToSchedule}
          className="rounded-md border px-3 py-2 text-sm font-medium"
        >
          Back to Schedule
        </Link>
        {typeof classDetail === "string" ? (
          <Link href={classDetail} className="rounded-md border px-3 py-2 text-sm font-medium">
            Class Detail
          </Link>
        ) : (
          <span className="text-sm">{classDetail.reason}</span>
        )}
        <TeacherStartLessonButton
          provider={normalizeTeacherStartLessonProvider(workspace.lesson.meetingProvider)}
          startState={workspace.lesson.startState}
        />
      </div>
      <div className="grid gap-1 text-sm">
        <p>Review Submissions disabled: {workspace.navigationHrefs.submissions.reason}</p>
        <p>Materials disabled: {workspace.navigationHrefs.materials.reason}</p>
        <p>{workspace.attendanceSummary.reason}</p>
      </div>
    </Section>
  );
}

function RosterSection({ workspace }: { workspace: TeacherLessonWorkspace }) {
  return (
    <Section title="Roster">
      {workspace.roster.length === 0 ? (
        <EmptyState>No students enrolled</EmptyState>
      ) : (
        <ul className="space-y-2">
          {workspace.roster.map((student) => (
            <li key={student.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{student.fullName}</p>
              {student.isActive ? <p>{student.email}</p> : <p>Email unavailable</p>}
              <p>{student.isActive ? "Active" : "Not active"}</p>
              {student.learningStatus ? (
                <p>Learning status: {genericLabel(student.learningStatus)}</p>
              ) : null}
              <p>Submission status: {genericLabel(student.submissionStatus)}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function MaterialsSection({ workspace }: { workspace: TeacherLessonWorkspace }) {
  return (
    <Section title="Materials">
      {workspace.materials.length === 0 ? (
        <EmptyState>No materials</EmptyState>
      ) : (
        <ul className="space-y-3">
          {workspace.materials.map((material) => (
            <li key={material.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{material.title}</p>
              {material.description ? <p>{material.description}</p> : null}
              <p>Uploaded: {formatDate(material.createdAt)}</p>
              {material.fileLink.disabled ? (
                <p>{material.fileLink.reason}</p>
              ) : (
                <Link href={material.fileLink.href} aria-label={material.fileLink.label}>
                  Open file
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AssignmentsSection({ workspace }: { workspace: TeacherLessonWorkspace }) {
  return (
    <Section title="Homework / Assignments">
      {workspace.assignments.length === 0 ? (
        <EmptyState>No assignments</EmptyState>
      ) : (
        <ul className="space-y-3">
          {workspace.assignments.map((assignment) => (
            <li key={assignment.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{assignment.title}</p>
              <p>Due: {formatDate(assignment.dueDate)}</p>
              <p>{assignment.isArchived ? "Archived" : genericLabel(assignment.dueState)}</p>
              <p>{assignment.submissionsCount} submissions</p>
              <p>{assignment.pendingSubmissionsCount} pending</p>
              <p>Review disabled</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SubmissionsSection({ workspace }: { workspace: TeacherLessonWorkspace }) {
  return (
    <Section title="Submissions / Grading">
      <div className="grid gap-1 text-sm">
        <p>Total submissions: {workspace.gradingSummary.totalSubmissions}</p>
        <p>Pending submissions: {workspace.gradingSummary.pendingSubmissions}</p>
        <p>Graded submissions: {workspace.gradingSummary.gradedSubmissions}</p>
      </div>
      {workspace.submissions.length === 0 ? (
        <EmptyState>No submissions</EmptyState>
      ) : (
        <ul className="space-y-3">
          {workspace.submissions.map((submission) => (
            <li key={submission.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">Student email: {submission.student.email}</p>
              <p>Assignment linked</p>
              <p>Submitted: {formatDate(submission.submittedAt)}</p>
              <p>Status: {genericLabel(submission.status)}</p>
              <p>Grade: {submission.grade ?? "Pending"}</p>
              {submission.feedback ? <p>Feedback: {submission.feedback}</p> : null}
              <p>Review disabled</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ProgressSection({ workspace }: { workspace: TeacherLessonWorkspace }) {
  return (
    <Section title="Progress Notes">
      <p className="text-sm">Progress notes count: {workspace.progressSummary.count}</p>
      <p className="text-sm">{workspace.progressSummary.reason}</p>
    </Section>
  );
}

export default async function TeacherLessonDetailPage({ params }: TeacherLessonDetailPageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const resolved = await params;
  const workspace = await getTeacherLessonWorkspace(session.uid, resolved.lessonId);

  if (!workspace) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <LessonHeader workspace={workspace} />
      <LessonActions workspace={workspace} />
      <RosterSection workspace={workspace} />
      <MaterialsSection workspace={workspace} />
      <AssignmentsSection workspace={workspace} />
      <SubmissionsSection workspace={workspace} />
      <ProgressSection workspace={workspace} />
    </main>
  );
}
