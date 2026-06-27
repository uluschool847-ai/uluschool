type SubmissionListItem = {
  id: string;
  submissionId?: string;
  studentName?: string;
  studentEmail?: string;
  student?: {
    id: string;
    fullName: string;
    email: string;
  };
  assignmentTitle: string;
  assignment?: {
    id: string;
    title: string;
  };
  classGroup?: {
    id: string;
    name: string;
  } | null;
  subject?: {
    id: string;
    name: string;
  } | null;
  submittedAt: string | Date;
  status?: "Pending" | "Graded" | string;
  grade: number | null;
  feedback?: string | null;
  feedbackPreview?: string | null;
  contentUrl?: string | null;
  attachmentLink?: {
    filename: string;
    href: string;
  } | null;
  reviewHref?: string | null;
  reviewDisabled?: boolean;
};

type SubmissionListProps = {
  submissions: SubmissionListItem[];
  filterSummary?: string | null;
  gradeAction?: string | ((formData: FormData) => void | Promise<void>);
};

function safeContentHref(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/uploads/")) return url;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function formatSubmittedAt(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Africa/Nairobi",
    year: "numeric",
  }).format(date);
}

function feedbackPreview(feedback: string | null | undefined) {
  if (!feedback) return null;
  const trimmed = feedback.trim();
  if (!trimmed) return null;
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

export function SubmissionList({
  filterSummary,
  gradeAction = "/portal/teacher/submissions/grade",
  submissions,
}: SubmissionListProps) {
  const firstAssignmentIndex = new Map<string, number>();
  submissions.forEach((submission, index) => {
    if (!firstAssignmentIndex.has(submission.assignmentTitle)) {
      firstAssignmentIndex.set(submission.assignmentTitle, index);
    }
  });

  if (submissions.length === 0) {
    return (
      <section className="rounded-lg border border-dashed p-4">
        {filterSummary ? (
          <p className="mb-2 text-sm text-muted-foreground">{filterSummary}</p>
        ) : null}
        <p>No submissions found.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {filterSummary ? <p className="text-sm text-muted-foreground">{filterSummary}</p> : null}
      {submissions.map((submission, index) => {
        const studentName = submission.student?.fullName ?? submission.studentName ?? "Student";
        const studentEmail = submission.student?.email ?? submission.studentEmail ?? "";
        const status = submission.grade === null ? "Pending" : "Graded";
        const contentHref = safeContentHref(
          submission.attachmentLink?.href ?? submission.contentUrl,
        );
        const scoreInputId = `score-${submission.id}`;
        const feedbackInputId = `feedback-${submission.id}`;
        const shouldShowAssignment = firstAssignmentIndex.get(submission.assignmentTitle) === index;
        const classGroup = submission.classGroup;
        const reviewHref =
          submission.reviewHref ??
          `/portal/teacher/submissions/${submission.submissionId ?? submission.id}`;
        const shouldShowClassGroup =
          classGroup && !filterSummary?.toLowerCase().includes(classGroup.name.toLowerCase());
        const shouldShowStatus = !filterSummary
          ?.toLowerCase()
          .includes(`status: ${status.toLowerCase()}`);
        const renderedFeedback = submission.feedbackPreview ?? feedbackPreview(submission.feedback);

        return (
          <article key={submission.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">{studentName}</p>
                {studentEmail ? (
                  <p className="text-sm text-muted-foreground">{studentEmail}</p>
                ) : null}
                {shouldShowAssignment ? (
                  <p>{submission.assignment?.title ?? submission.assignmentTitle}</p>
                ) : null}
                {shouldShowClassGroup ? <p>Class: {classGroup.name}</p> : null}
                {submission.subject ? <p>{submission.subject.name}</p> : null}
                <p>Submitted: {formatSubmittedAt(submission.submittedAt)}</p>
                <p>Grade: {submission.grade ?? "No score"}</p>
                {renderedFeedback ? <p>Feedback: {renderedFeedback}</p> : null}
              </div>
              {shouldShowStatus ? (
                <span className="rounded-full border px-2 py-1 text-xs">Status: {status}</span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {contentHref ? (
                <a
                  className="rounded-md border px-3 py-2 text-sm"
                  href={contentHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  View submission
                  {submission.attachmentLink?.filename
                    ? `: ${submission.attachmentLink.filename}`
                    : ""}
                </a>
              ) : null}
              {reviewHref ? (
                <a className="rounded-md border px-3 py-2 text-sm" href={reviewHref}>
                  Review
                </a>
              ) : (
                <button className="rounded-md border px-3 py-2 text-sm" disabled type="button">
                  Review unavailable
                </button>
              )}
              <button className="rounded-md border px-3 py-2 text-sm" type="button">
                {status === "Pending" ? "Grade" : "Update grade"}
              </button>
            </div>

            <div className="mt-3">
              <form
                action={gradeAction}
                className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                method="post"
              >
                <input type="hidden" name="submissionId" value={submission.id} />
                <div className="grid gap-1">
                  <label htmlFor={scoreInputId}>Score 0-100</label>
                  <input
                    id={scoreInputId}
                    name="grade"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Score 0-100"
                    defaultValue={submission.grade ?? ""}
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <label htmlFor={feedbackInputId}>Feedback</label>
                  <input
                    id={feedbackInputId}
                    name="feedback"
                    placeholder="Feedback"
                    defaultValue={submission.feedback ?? ""}
                  />
                </div>
                <button className="rounded-md border px-3 py-2 text-sm" type="submit">
                  Save Grade
                </button>
              </form>
            </div>
          </article>
        );
      })}
    </section>
  );
}
