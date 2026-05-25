type SafeLink = {
  href?: string | null;
  title?: string | null;
  filename?: string | null;
};

type SubmissionSummary = {
  id: string;
  contentUrl?: string | null;
  submittedWorkHref?: string | null;
  submittedAt?: Date | string | null;
  grade?: number | null;
  feedback?: string | null;
};

type AssignmentDetail = {
  id: string;
  title: string;
  description: string;
  dueDate: Date | string;
  archivedAt?: Date | string | null;
  subject?: { id: string; name: string } | null;
  scheduledClass?: { id: string; title: string } | null;
  classGroup?: { id: string; name: string } | null;
  teacher?: { id: string; fullName: string; email?: string | null } | null;
  materials?: SafeLink[];
  currentSubmission?: SubmissionSummary | null;
  grade?: number | null;
  feedback?: string | null;
  canSubmit?: boolean;
  canResubmit?: boolean;
  readOnlyReason?: string | null;
  status?: string | null;
};

type AssignmentDetailViewProps = {
  assignment: AssignmentDetail;
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

function LinkOrText({ href, label }: { href?: string | null; label: string }) {
  const safe = safeHref(href);
  if (!safe) return <span>{label}</span>;

  return (
    <a href={safe} target={safe.startsWith("https://") ? "_blank" : undefined} rel="noreferrer">
      {label}
    </a>
  );
}

export function AssignmentDetailView({ assignment }: AssignmentDetailViewProps) {
  const currentSubmission = assignment.currentSubmission ?? null;
  const grade = assignment.grade ?? currentSubmission?.grade ?? null;
  const feedback = assignment.feedback ?? currentSubmission?.feedback ?? null;
  const isMissingAssignment = assignment.status?.toLowerCase() === "missing";
  const subject = assignment.subject ?? null;
  const shouldRenderSubject =
    subject &&
    !assignment.title.toLowerCase().includes(subject.name.toLowerCase()) &&
    !assignment.classGroup?.name.toLowerCase().includes(subject.name.toLowerCase());

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{assignment.title}</h1>
        <p className="text-sm text-muted-foreground">{assignment.description}</p>
        <p className="text-sm">Due: {formatDate(assignment.dueDate)}</p>
        {assignment.archivedAt ? (
          <output className="block rounded-md border border-secondary bg-muted p-3 text-sm">
            {assignment.readOnlyReason
              ? `${assignment.readOnlyReason} Read-only.`
              : "This assignment is archived and read-only."}
          </output>
        ) : null}
        {!assignment.archivedAt && isMissingAssignment ? (
          <output className="block rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Reminder: This assignment is overdue. Submit it as soon as possible.
          </output>
        ) : null}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {shouldRenderSubject ? (
          <div>
            <dt className="font-medium">Subject</dt>
            <dd>{subject.name}</dd>
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

      <section aria-labelledby="assignment-materials-heading" className="space-y-3">
        <h2 id="assignment-materials-heading" className="text-xl font-semibold">
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

      {currentSubmission ? (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Current Submission</h2>
          <p className="text-sm">
            <LinkOrText
              href={currentSubmission.submittedWorkHref ?? currentSubmission.contentUrl}
              label="View work"
            />
          </p>
        </section>
      ) : null}

      {grade !== null || feedback ? (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Grade and Feedback</h2>
          {grade !== null ? <p className="text-sm">Grade: {grade}</p> : null}
          {feedback ? <p className="text-sm">Feedback: {feedback}</p> : null}
        </section>
      ) : null}
    </section>
  );
}
