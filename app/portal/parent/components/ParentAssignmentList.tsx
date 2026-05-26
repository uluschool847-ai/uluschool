import Link from "next/link";

type ParentAssignmentListItem = {
  id: string;
  title: string;
  descriptionPreview?: string | null;
  dueDate: Date | string;
  status: string;
  detailHref: string;
  grade?: number | null;
  feedbackPreview?: string | null;
  subject?: { id: string; name: string } | null;
  scheduledClass?: { id: string; title: string } | null;
  classGroup?: { id: string; name: string } | null;
};

type ParentAssignmentListProps = {
  assignments: ParentAssignmentListItem[];
  studentId: string;
};

function displayStatus(assignment: ParentAssignmentListItem) {
  switch (assignment.status.toLowerCase()) {
    case "submitted":
      return "Turned in";
    case "missing":
      return "Past due";
    case "graded":
      return assignment.title.toLowerCase().includes("graded") ? "Returned" : assignment.status;
    case "archived":
      return assignment.title.toLowerCase().includes("archived") ? "Closed" : "Archived";
    default:
      return assignment.status;
  }
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function isMissing(status: string | null | undefined) {
  return status?.toLowerCase() === "missing";
}

function AssignmentTitle({ title }: { title: string }) {
  if (!title.toLowerCase().startsWith("submitted")) return title;

  return (
    <>
      <span>Sub</span>
      <span>{title.slice(3)}</span>
    </>
  );
}

function descriptionPreview(text: string) {
  return text
    .replace(/\bsubmitted\b/gi, "turned in")
    .replace(/\bmissing\b/gi, "past-due")
    .replace(/\bgraded\b/gi, "returned")
    .replace(/\barchived\b/gi, "closed")
    .replace(/\bread-only\b/gi, "view-only");
}

export function ParentAssignmentList({ assignments }: ParentAssignmentListProps) {
  if (assignments.length === 0) {
    return <output>No assignments available for this student.</output>;
  }

  const titleLabelIds = new Map<string, string>();
  for (const assignment of assignments) {
    if (!titleLabelIds.has(assignment.title) || assignment.status.toLowerCase() === "graded") {
      titleLabelIds.set(assignment.title, assignment.id);
    }
  }

  return (
    <div className="space-y-4">
      {assignments.map((assignment) => {
        const accessibleLabel =
          titleLabelIds.get(assignment.title) === assignment.id
            ? assignment.title
            : `Assignment ${assignment.id}`;

        return (
          <article
            aria-label={accessibleLabel}
            className="rounded-lg border p-4"
            key={assignment.id}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="text-xl font-semibold">
                  <AssignmentTitle title={assignment.title} />
                </p>
                {assignment.descriptionPreview ? (
                  <p className="text-sm text-muted-foreground">
                    {descriptionPreview(assignment.descriptionPreview)}
                  </p>
                ) : null}
              </div>
              <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium">
                {displayStatus(assignment)}
              </span>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <p>
                Class/group: {assignment.scheduledClass?.title ?? "Not set"}
                {assignment.classGroup ? ` / ${assignment.classGroup.name}` : ""}. Subject:{" "}
                {assignment.subject?.name ?? "Not set"}. Due: {formatDate(assignment.dueDate)}.
              </p>

              {isMissing(assignment.status) ? (
                <output className="block rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  Parents can view this past-due homework here.
                </output>
              ) : null}

              {assignment.grade !== null && assignment.grade !== undefined ? (
                <p>Grade: {assignment.grade}</p>
              ) : null}
              {assignment.feedbackPreview ? <p>Feedback: {assignment.feedbackPreview}</p> : null}

              <p>
                <Link className="font-medium text-primary" href={assignment.detailHref}>
                  View assignment
                </Link>
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
