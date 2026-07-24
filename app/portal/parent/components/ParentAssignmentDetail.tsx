import { safeStoredFileHref } from "@/lib/security/storage-links";

type SafeLink = {
  href?: string | null;
  title?: string | null;
  filename?: string | null;
};

type SubmissionHistoryItem = {
  id: string;
  contentUrl?: string | null;
  submittedWorkHref?: string | null;
  submittedAt: Date | string;
  grade: number | null;
  feedback: string | null;
  status?: string | null;
};

type ParentAssignmentDetailViewModel = {
  id: string;
  title: string;
  description: string;
  dueDate: Date | string;
  archivedAt?: Date | string | null;
  status?: string | null;
  subject?: { id: string; name: string } | null;
  scheduledClass?: { id: string; title: string } | null;
  classGroup?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string; email?: string | null } | null;
  materials?: SafeLink[];
  currentSubmission?: {
    id: string;
    contentUrl?: string | null;
    submittedWorkHref?: string | null;
    submittedAt?: Date | string | null;
    grade?: number | null;
    feedback?: string | null;
  } | null;
  submissionHistory?: SubmissionHistoryItem[];
  grade?: number | null;
  feedback?: string | null;
};

type ParentAssignmentDetailProps = {
  assignment: ParentAssignmentDetailViewModel;
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
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

function formatSubmissionDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-GB", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeHref(href: string | null | undefined) {
  return safeStoredFileHref(href);
}

function LinkOrText({ href, label }: { href?: string | null; label: string }) {
  const safe = safeHref(href);
  if (!safe) return <span>{label}</span>;

  return (
    <a href={safe} rel="noreferrer" target={safe.startsWith("https://") ? "_blank" : undefined}>
      {label}
    </a>
  );
}

function submissionStatus(submission: SubmissionHistoryItem) {
  const status = submission.status ?? (submission.grade !== null ? "Graded" : "Submitted");
  return status;
}

function ReadOnlyNotice({ archived }: { archived: boolean }) {
  return (
    <output className="block rounded-md border bg-muted p-3 text-sm">
      {archived
        ? "This assignment is archived. Read-only."
        : "Parents can view assignment progress. Read-only."}
    </output>
  );
}

export function ParentAssignmentDetail({ assignment }: ParentAssignmentDetailProps) {
  const submissions = assignment.submissionHistory ?? [];
  const currentSubmission = assignment.currentSubmission ?? null;
  const grade = assignment.grade ?? currentSubmission?.grade ?? null;
  const feedback = assignment.feedback ?? currentSubmission?.feedback ?? null;
  const archived = Boolean(assignment.archivedAt);
  const shouldRenderSubject =
    assignment.subject &&
    !assignment.title.toLowerCase().includes(assignment.subject.name.toLowerCase()) &&
    !assignment.classGroup?.name.toLowerCase().includes(assignment.subject.name.toLowerCase());

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{assignment.title}</h1>
          <p className="text-sm text-muted-foreground">{assignment.description}</p>
          <p className="text-sm">Due: {formatDate(assignment.dueDate)}</p>
          <ReadOnlyNotice archived={archived} />
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {shouldRenderSubject ? (
            <div>
              <dt className="font-medium">Subject</dt>
              <dd>{assignment.subject?.name}</dd>
            </div>
          ) : null}
          {assignment.scheduledClass ? (
            <div>
              <dt className="font-medium">Class</dt>
              <dd>{assignment.scheduledClass.title}</dd>
            </div>
          ) : null}
          {assignment.classGroup ? (
            <div>
              <dt className="font-medium">Group</dt>
              <dd>{assignment.classGroup.name}</dd>
            </div>
          ) : null}
          {assignment.teacher ? (
            <div>
              <dt className="font-medium">Teacher</dt>
              <dd>{assignment.teacher.fullName}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="parent-assignment-materials" className="space-y-3">
        <h2 className="text-xl font-semibold" id="parent-assignment-materials">
          Materials
        </h2>
        {assignment.materials && assignment.materials.length > 0 ? (
          <ul className="space-y-2">
            {assignment.materials.map((material) => {
              const label = material.title ?? material.filename ?? "Material";
              return (
                <li key={`${material.href ?? material.title}-${label}`}>
                  <LinkOrText href={material.href} label={label} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No materials attached.</p>
        )}
      </section>

      {grade !== null || feedback ? (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Grade and Feedback</h2>
          {grade !== null ? <p className="text-sm">Grade: {grade}</p> : null}
          {feedback ? <p className="text-sm">Feedback: {feedback}</p> : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Submission History</h2>
        {submissions.length === 0 ? (
          <p>No submissions yet.</p>
        ) : (
          <ul className="space-y-3">
            {submissions.map((submission) => (
              <li className="space-y-1 rounded-md border p-3" key={submission.id}>
                <p className="font-medium">{submissionStatus(submission)}</p>
                <p className="text-sm">Received: {formatSubmissionDate(submission.submittedAt)}</p>
                <p className="text-sm">
                  <LinkOrText
                    href={submission.submittedWorkHref ?? submission.contentUrl}
                    label="View work"
                  />
                </p>
                {submission.grade !== null ? (
                  <p className="text-sm">Score: {submission.grade}</p>
                ) : null}
                {submission.feedback && submission.feedback !== feedback ? (
                  <p className="text-sm">Feedback: {submission.feedback}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
