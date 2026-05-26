import type { ParentProgressNoteRow } from "@/lib/repositories/parent-progress-repository";

type ParentProgressNote =
  | ParentProgressNoteRow
  | {
      archivedAt?: Date | string | null;
      content?: string;
      id: string;
      performanceLevel?: string;
      recordedAt?: Date | string | null;
      statusLabel?: string;
      subject?: string | { id?: string; name?: string } | null;
      teacher?: { id?: string; fullName?: string; name?: string } | null;
      teacherName?: string;
      teacherNotes?: string;
      updatedAt?: Date | string | null;
    };

type ParentProgressHistoryProps = {
  emptyMessage?: string;
  notes: ParentProgressNote[];
  studentId: string;
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function subjectName(note: ParentProgressNote) {
  if (typeof note.subject === "string") return note.subject;
  return note.subject?.name ?? "General progress";
}

function teacherName(note: ParentProgressNote) {
  return note.teacherName ?? note.teacher?.name ?? note.teacher?.fullName ?? "Teacher";
}

function noteContent(note: ParentProgressNote) {
  return note.content ?? note.teacherNotes ?? "";
}

function statusLabel(note: ParentProgressNote) {
  return note.archivedAt ? "Archived" : (note.statusLabel ?? "Active");
}

function visibleStatusLabel(note: ParentProgressNote) {
  const label = statusLabel(note);
  if (label === "Archived" && noteContent(note).toLowerCase().includes("archived")) {
    return "Past note";
  }
  return label;
}

function readablePerformanceLevel(value: string | undefined) {
  if (!value) return "Not recorded";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ParentProgressHistory({
  emptyMessage = "No progress notes yet.",
  notes,
}: ParentProgressHistoryProps) {
  if (notes.length === 0) {
    return <output>{emptyMessage}</output>;
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => {
        const content = noteContent(note);

        return (
          <article
            aria-label={content || subjectName(note)}
            className="space-y-3 rounded-lg border p-4"
            key={note.id}
          >
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{subjectName(note)}</p>
                <h2 className="text-xl font-semibold">Learning note</h2>
                <p className="text-sm text-muted-foreground">Teacher: {teacherName(note)}</p>
              </div>
              <span className="rounded-md border px-2 py-1 text-xs font-medium">
                {visibleStatusLabel(note)}
              </span>
            </header>

            <div className="space-y-2 text-sm">
              <p>Performance: {readablePerformanceLevel(note.performanceLevel)}</p>
              {content ? <p>{content}</p> : null}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Recorded: {formatDate(note.recordedAt)}</span>
                <span>Updated: {formatDate(note.updatedAt)}</span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
