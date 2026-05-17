type SubmissionListItem = {
  id: string;
  studentName: string;
  assignmentTitle: string;
  submittedAt: string;
  grade: number | null;
  feedback: string | null;
};

type SubmissionListProps = {
  submissions: SubmissionListItem[];
};

export function SubmissionList({ submissions }: SubmissionListProps) {
  const firstAssignmentIndex = new Map<string, number>();
  submissions.forEach((submission, index) => {
    if (!firstAssignmentIndex.has(submission.assignmentTitle)) {
      firstAssignmentIndex.set(submission.assignmentTitle, index);
    }
  });

  return (
    <section>
      {submissions.map((submission, index) => (
        <article key={submission.id}>
          <h3>{submission.studentName}</h3>
          {firstAssignmentIndex.get(submission.assignmentTitle) === index ? (
            <p>{submission.assignmentTitle}</p>
          ) : null}
          <p>{submission.submittedAt}</p>
          <p>{submission.grade !== null ? `Score: ${submission.grade}` : "Ungraded"}</p>
        </article>
      ))}
    </section>
  );
}
