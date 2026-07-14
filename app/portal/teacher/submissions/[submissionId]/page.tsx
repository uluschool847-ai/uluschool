import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmissionReviewForm } from "@/app/portal/teacher/components/SubmissionReviewForm";
import { requireRole } from "@/lib/auth/session";
import { getSubmissionForTeacher } from "@/lib/repositories/submission-repository";
import { safeStoredFileHref } from "@/lib/security/storage-links";

export const metadata: Metadata = {
  title: "Review Submission - mathSchool",
};

type TeacherSubmissionReviewPageProps = {
  params: Promise<{ submissionId: string }> | { submissionId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

const SUBMISSIONS_BACK_FILTER_PARAMS = [
  "status",
  "classGroupId",
  "scheduledClassId",
  "assignmentId",
  "studentId",
  "subjectId",
  "search",
  "sort",
] as const;

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Africa/Nairobi",
    year: "numeric",
  }).format(date);
}

function safeSubmittedWorkHref(url: string | null | undefined) {
  return safeStoredFileHref(url);
}

function getBackToSubmissionsHref(searchParams: Record<string, string | undefined>) {
  const backParams = new URLSearchParams();

  for (const key of SUBMISSIONS_BACK_FILTER_PARAMS) {
    const value = searchParams[key];
    if (value) {
      backParams.set(key, value);
    }
  }

  const query = backParams.toString();
  return query ? `/portal/teacher/submissions?${query}` : "/portal/teacher/submissions";
}

function isLateSubmission(input: {
  dueDate: Date | string | null | undefined;
  submittedAt: Date | string | null | undefined;
}) {
  if (!input.dueDate || !input.submittedAt) return false;

  const dueDate = input.dueDate instanceof Date ? input.dueDate : new Date(input.dueDate);
  const submittedAt =
    input.submittedAt instanceof Date ? input.submittedAt : new Date(input.submittedAt);

  if (Number.isNaN(dueDate.getTime()) || Number.isNaN(submittedAt.getTime())) {
    return false;
  }

  return submittedAt.getTime() > dueDate.getTime();
}

export default async function TeacherSubmissionReviewPage({
  params,
  searchParams = {},
}: TeacherSubmissionReviewPageProps) {
  const session = await requireRole([UserRole.TEACHER]);
  const { submissionId } = await params;
  const resolvedSearchParams = await searchParams;
  const submission = await getSubmissionForTeacher(session.uid, submissionId);

  if (!submission) {
    notFound();
  }

  const submittedWorkHref = safeSubmittedWorkHref(
    submission.submittedWorkHref ?? submission.contentUrl,
  );
  const backToSubmissionsHref = getBackToSubmissionsHref(resolvedSearchParams);
  const lateSubmission = isLateSubmission({
    dueDate: submission.assignment.dueDate,
    submittedAt: submission.submittedAt,
  });

  return (
    <main className="space-y-6">
      <header className="space-y-3">
        <Link className="text-sm underline" href={backToSubmissionsHref}>
          Back to submissions
        </Link>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Submission review</p>
          <h1 className="text-3xl font-bold tracking-tight">{submission.assignment.title}</h1>
          <p>{submission.assignment.description ?? "No assignment description provided."}</p>
        </div>
      </header>

      <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <div>
          <h2 className="font-semibold">Student</h2>
          <p>{submission.student.fullName}</p>
          <p className="text-sm text-muted-foreground">{submission.student.email}</p>
        </div>

        <div>
          <h2 className="font-semibold">Class / subject</h2>
          {submission.classGroup ? (
            <Link className="underline" href={submission.classGroup.href}>
              Class Detail: {submission.classGroup.name}
            </Link>
          ) : (
            <p>{submission.scheduledClass.title}</p>
          )}
          <p>{submission.subject?.name ?? "No subject"}</p>
        </div>

        <div>
          <h2 className="font-semibold">Dates</h2>
          <p>Due: {formatDateTime(submission.assignment.dueDate)}</p>
          <p>Submitted: {formatDateTime(submission.submittedAt)}</p>
          {lateSubmission ? (
            <p role="alert">Late submission: Submitted after the due date.</p>
          ) : null}
          {submission.updatedAt &&
          new Date(submission.updatedAt).getTime() !==
            new Date(submission.submittedAt).getTime() ? (
            <p>Resubmitted or updated: {formatDateTime(submission.updatedAt)}</p>
          ) : null}
        </div>

        <div>
          <h2 className="font-semibold">Status</h2>
          <p>{submission.status}</p>
          <p>Current grade: {submission.grade ?? "No score"}</p>
          <p>Current feedback: {submission.feedback ?? "No feedback"}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Submitted work</h2>
        {submittedWorkHref ? (
          <a
            className="inline-flex rounded-md border px-3 py-2 text-sm"
            href={submittedWorkHref}
            target="_blank"
            rel="noreferrer"
          >
            Open submitted work
          </a>
        ) : (
          <p>Submitted work unavailable or invalid submitted work link.</p>
        )}

        {submission.attachments.length > 0 ? (
          <ul className="space-y-2">
            {submission.attachments.map((attachment) => {
              const href = safeSubmittedWorkHref(attachment.href);
              return (
                <li key={attachment.id}>
                  {href ? (
                    <a className="underline" href={href} target="_blank" rel="noreferrer">
                      {attachment.filename}
                    </a>
                  ) : (
                    <span>{attachment.filename}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Grade submission</h2>
        {resolvedSearchParams.graded === "success" ? (
          <output>Grade saved successfully.</output>
        ) : null}
        {resolvedSearchParams.error === "grade" ? (
          <p role="alert">Unable to save grade. Check the score and try again.</p>
        ) : null}
        {resolvedSearchParams.error === "feedback" ? (
          <p role="alert">Feedback must be 2000 characters or fewer.</p>
        ) : null}
        <SubmissionReviewForm
          submissionId={submission.id}
          initialGrade={submission.grade}
          initialFeedback={submission.feedback}
        />
      </section>
    </main>
  );
}
