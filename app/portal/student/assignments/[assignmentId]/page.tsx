import { UserRole } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AssignmentDetailView } from "@/app/portal/student/components/AssignmentDetailView";
import { SubmissionHistory } from "@/app/portal/student/components/SubmissionHistory";
import { SubmitWorkForm } from "@/app/portal/student/components/SubmitWorkForm";
import { requireRole } from "@/lib/auth/session";
import { getAssignmentDetailForStudent } from "@/lib/repositories/submission-repository";

export const metadata: Metadata = {
  title: "Assignment Detail - Student Portal",
};

type PageProps = {
  params: Promise<{ assignmentId: string }> | { assignmentId: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
};

export default async function StudentAssignmentDetailPage({ params }: PageProps) {
  const session = await requireRole([UserRole.STUDENT]);
  const { assignmentId } = await params;
  const assignment = await getAssignmentDetailForStudent(session.uid, assignmentId);

  if (!assignment) {
    notFound();
  }

  return (
    <main className="space-y-6">
      <p>
        <Link className="text-sm font-medium text-primary" href="/portal/student/assignments">
          Back to assignments
        </Link>
      </p>

      <AssignmentDetailView
        assignment={{
          ...assignment,
          currentSubmission: assignment.currentSubmission
            ? {
                ...assignment.currentSubmission,
                feedback: null,
                grade: null,
              }
            : null,
          feedback: null,
          grade: null,
        }}
      />

      {assignment.lessonHref ? (
        <p>
          <Link className="font-medium text-primary" href={assignment.lessonHref}>
            Lesson context
          </Link>
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Submission History</h2>
        <SubmissionHistory submissions={assignment.submissionHistory} />
      </section>

      {!assignment.archivedAt ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            {assignment.currentSubmission ? "Resubmit Work" : "Submit Work"}
          </h2>
          <SubmitWorkForm
            assignmentId={assignment.id}
            existingSubmission={assignment.currentSubmission ?? undefined}
          />
        </section>
      ) : null}
    </main>
  );
}
