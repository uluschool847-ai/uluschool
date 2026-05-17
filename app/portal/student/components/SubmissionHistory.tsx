type SubmissionHistoryItem = {
  id: string;
  contentUrl: string;
  submittedAt: string;
  grade: number | null;
  feedback: string | null;
};

type SubmissionHistoryProps = {
  submissions: SubmissionHistoryItem[];
};

export function SubmissionHistory({ submissions }: SubmissionHistoryProps) {
  if (submissions.length === 0) {
    return <p>Not Submitted</p>;
  }

  return (
    <ul className="space-y-3">
      {submissions.map((submission) => {
        const isGraded = submission.grade !== null;
        return (
          <li key={submission.id} className="rounded-md border p-3 space-y-1">
            <p className="font-medium">{isGraded ? "Graded" : "Ungraded"}</p>
            <p className="text-sm">Submitted: {submission.submittedAt}</p>
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
