import type { ProgressNoteViewModel } from "@/lib/repositories/student-progress-repository";

type StudentProgressHistoryNote =
  | ProgressNoteViewModel
  | {
      id: string;
      archivedAt: string | null;
      content?: string;
      performanceLevel: string;
      recordedAt: string;
      statusLabel?: string;
      subject: { id: string; name: string } | null;
      teacher?: { id: string; fullName?: string; name?: string } | null;
      teacherName?: string;
      teacherNotes?: string;
      updatedAt: string;
    };

type StudentProgressHistoryProps = {
  emptyMessage?: string;
  notes: StudentProgressHistoryNote[];
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

function subjectName(note: StudentProgressHistoryNote) {
  return note.subject?.name ?? "General progress";
}

function teacherName(note: StudentProgressHistoryNote) {
  return note.teacherName ?? note.teacher?.name ?? note.teacher?.fullName ?? "Teacher";
}

function noteContent(note: StudentProgressHistoryNote) {
  return note.teacherNotes ?? note.content ?? "";
}

function statusLabel(note: StudentProgressHistoryNote) {
  return note.archivedAt ? "Read-only" : (note.statusLabel ?? "Active");
}

export function StudentProgressHistory({
  emptyMessage = "No progress notes yet.",
  notes,
}: StudentProgressHistoryProps) {
  if (notes.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="space-y-4">
      {notes.map((note) => (
        <article
          aria-label={subjectName(note)}
          className="space-y-2 rounded-md border p-4"
          key={note.id}
        >
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Progress note</h2>
              <p className="text-sm text-muted-foreground">Teacher: {teacherName(note)}</p>
            </div>
            <span className="rounded-md border px-2 py-1 text-xs font-medium">
              {statusLabel(note)}
            </span>
          </header>

          <div className="grid gap-1 text-sm">
            <p>Subject: {subjectName(note)}</p>
            <p>Performance: {note.performanceLevel}</p>
            <p>{noteContent(note)}</p>
            <p>Recorded: {formatDate(note.recordedAt)}</p>
            <p>Updated: {formatDate(note.updatedAt)}</p>
            {note.archivedAt ? <p>Read-only note</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
