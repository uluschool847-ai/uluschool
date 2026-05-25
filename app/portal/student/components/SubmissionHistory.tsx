type SubmissionHistoryItem = {
  id: string;
  contentUrl?: string | null;
  submittedWorkHref?: string | null;
  submittedAt: Date | string;
  grade: number | null;
  feedback: string | null;
  status?: string | null;
};

type SubmissionHistoryProps = {
  submissions: SubmissionHistoryItem[];
};

function formatDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeHref(href: string | null | undefined) {
  if (!href) return null;
  if (href.startsWith("/uploads/")) return href;

  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function SubmissionHistory({ submissions }: SubmissionHistoryProps) {
  if (submissions.length === 0) {
    return <p>No submissions yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {submissions.map((submission) => {
        const isGraded = submission.grade !== null;
        const status = submission.status ?? (isGraded ? "Graded" : "Pending");
        const submittedWorkHref = safeHref(submission.submittedWorkHref ?? submission.contentUrl);

        return (
          <li key={submission.id} className="space-y-1 rounded-md border p-3">
            <p className="font-medium">{status}</p>
            <p className="text-sm">Submitted: {formatDate(submission.submittedAt)}</p>
            {submittedWorkHref ? (
              <p className="text-sm">
                <a
                  href={submittedWorkHref}
                  target={submittedWorkHref.startsWith("https://") ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  View work
                </a>
              </p>
            ) : null}
            {isGraded ? <p className="text-sm">Grade: {submission.grade}</p> : null}
            {isGraded && submission.feedback ? (
              <p className="text-sm">Feedback: {submission.feedback}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
