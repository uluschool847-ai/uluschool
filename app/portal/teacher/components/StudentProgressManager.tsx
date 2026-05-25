"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import {
  archiveProgressNoteAction,
  editProgressNoteAction,
  submitProgressNoteAction,
} from "@/app/portal/teacher/actions/progress-actions";
import { normalizeActionResult } from "@/lib/action-result";

type NotePerformanceLevel = "EXCELLENT" | "GOOD" | "STRUGGLING";

const performanceLevels: NotePerformanceLevel[] = ["EXCELLENT", "GOOD", "STRUGGLING"];
const maxContentLength = 2000;
const pendingMaxAgeMs = 5 * 60 * 1000;

type SubjectOption = {
  id: string;
  name: string;
};

type StudentProgressNote = {
  id: string;
  content?: string;
  teacherNotes?: string;
  performanceLevel?: NotePerformanceLevel;
  gradeLevel?: NotePerformanceLevel;
  subject?: SubjectOption | null;
  subjectId?: string;
  teacherName?: string;
  createdAt?: string;
  recordedAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  canEdit?: boolean;
};

type StudentProgressManagerProps = {
  studentId: string;
  subjectId?: string;
  subjects?: SubjectOption[];
  notes: StudentProgressNote[];
};

type PendingProgressMutation =
  | { content: string; timestamp: number; type: "create" }
  | { content: string; noteId: string; timestamp: number; type: "edit" }
  | { noteId: string; timestamp: number; type: "archive" };
type PendingProgressMutationInput =
  | { content: string; type: "create" }
  | { content: string; noteId: string; type: "edit" }
  | { noteId: string; type: "archive" };

function noteContent(note: StudentProgressNote) {
  return note.content ?? note.teacherNotes ?? "";
}

function noteLevel(note: StudentProgressNote): NotePerformanceLevel {
  return note.performanceLevel ?? note.gradeLevel ?? "GOOD";
}

function displayDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Kiev",
  }).format(new Date(value));
}

function fieldErrorMessage(error: string | Record<string, string[] | undefined>) {
  if (typeof error === "string") return error;
  return (
    error.content?.[0] ??
    error.performanceLevel?.[0] ??
    error.studentId?.[0] ??
    error.subjectId?.[0] ??
    "Could not save note"
  );
}

function parsePendingMutation(value: string | null): PendingProgressMutation | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingProgressMutation>;
    if (
      parsed.timestamp &&
      Date.now() - parsed.timestamp <= pendingMaxAgeMs &&
      (parsed.type === "create" || parsed.type === "edit" || parsed.type === "archive")
    ) {
      return parsed as PendingProgressMutation;
    }
  } catch {
    return null;
  }
  return null;
}

export function StudentProgressManager({
  studentId,
  subjectId,
  subjects = [],
  notes,
}: StudentProgressManagerProps) {
  const subjectOptions = useMemo(() => {
    const byId = new Map<string, SubjectOption>();
    for (const subject of subjects) {
      byId.set(subject.id, subject);
    }
    if (subjectId && !byId.has(subjectId)) {
      byId.set(subjectId, { id: subjectId, name: subjectId });
    }
    return Array.from(byId.values());
  }, [subjectId, subjects]);

  const initialSubjectId = subjectId ?? subjectOptions[0]?.id ?? "";
  const pendingStorageKey = useMemo(() => `student-progress-pending:${studentId}`, [studentId]);
  const [currentNotes, setCurrentNotes] = useState(notes);
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialSubjectId);
  const [content, setContent] = useState("");
  const [performanceLevel, setPerformanceLevel] = useState<NotePerformanceLevel>("GOOD");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    setIsHydrated(true);
    const pendingMutation = parsePendingMutation(window.sessionStorage.getItem(pendingStorageKey));
    if (!pendingMutation) {
      window.sessionStorage.removeItem(pendingStorageKey);
      return;
    }

    const successMessageForPending =
      pendingMutation.type === "create" &&
      currentNotes.some((note) => noteContent(note) === pendingMutation.content)
        ? "Progress note saved."
        : pendingMutation.type === "edit" &&
            currentNotes.some(
              (note) =>
                note.id === pendingMutation.noteId && noteContent(note) === pendingMutation.content,
            )
          ? "Progress note updated successfully."
          : pendingMutation.type === "archive" &&
              !currentNotes.some((note) => note.id === pendingMutation.noteId)
            ? "Progress note archived successfully."
            : "";

    if (successMessageForPending) {
      setSuccessMessage(successMessageForPending);
      window.sessionStorage.removeItem(pendingStorageKey);
    }
  }, [currentNotes, pendingStorageKey]);

  useEffect(() => {
    setCurrentNotes(notes);
  }, [notes]);

  function setPendingMutation(mutation: PendingProgressMutationInput) {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        pendingStorageKey,
        JSON.stringify({ ...mutation, timestamp: Date.now() }),
      );
    }
  }

  function clearPendingMutation() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(pendingStorageKey);
    }
  }

  function showSuccessMessage(message: string) {
    setSuccessMessage(message);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      void handleSubmit();
    });
  }

  function validateForm() {
    if (!selectedSubjectId) return "Subject is required";
    if (!content.trim()) return "Content is required";
    if (content.trim().length > maxContentLength) {
      return "Content must be 2000 characters or less";
    }
    if (!performanceLevels.includes(performanceLevel)) {
      return "Performance level is invalid";
    }
    return null;
  }

  function resetForm() {
    setEditingNoteId(null);
    setContent("");
    setPerformanceLevel("GOOD");
    setSelectedSubjectId(initialSubjectId);
  }

  async function handleSubmit() {
    setErrorMessage("");
    setSuccessMessage("");

    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        studentId,
        subjectId: selectedSubjectId,
        content: content.trim(),
        performanceLevel,
      };
      setPendingMutation(
        editingNoteId
          ? { content: payload.content, noteId: editingNoteId, type: "edit" }
          : { content: payload.content, type: "create" },
      );
      const result = editingNoteId
        ? await editProgressNoteAction(editingNoteId, {
            content: payload.content,
            performanceLevel: payload.performanceLevel,
          })
        : await submitProgressNoteAction(payload);

      if (!result.success) {
        clearPendingMutation();
        setIsSaving(false);
        setErrorMessage(fieldErrorMessage(result.error));
        return;
      }

      const now = new Date().toISOString();
      const selectedSubject =
        subjectOptions.find((subject) => subject.id === selectedSubjectId) ?? null;

      if (editingNoteId) {
        setCurrentNotes((previous) =>
          previous.map((note) =>
            note.id === editingNoteId
              ? {
                  ...note,
                  content: payload.content,
                  teacherNotes: payload.content,
                  performanceLevel: payload.performanceLevel,
                  gradeLevel: payload.performanceLevel,
                  subjectId: selectedSubjectId,
                  subject: selectedSubject,
                  updatedAt: now,
                }
              : note,
          ),
        );
        showSuccessMessage("Progress note updated successfully.");
      } else {
        setCurrentNotes((previous) => [
          {
            id: result.data.id,
            content: payload.content,
            teacherNotes: payload.content,
            performanceLevel: payload.performanceLevel,
            gradeLevel: payload.performanceLevel,
            subjectId: selectedSubjectId,
            subject: selectedSubject,
            recordedAt: now,
            createdAt: now,
            updatedAt: now,
            archivedAt: null,
            canEdit: true,
          },
          ...previous,
        ]);
        showSuccessMessage("Progress note saved.");
      }

      resetForm();
      setIsSaving(false);
    } catch {
      clearPendingMutation();
      setIsSaving(false);
      setErrorMessage(normalizeActionResult(undefined).message);
    }
  }

  function beginEdit(note: StudentProgressNote) {
    if (note.archivedAt) return;
    setErrorMessage("");
    setSuccessMessage("");
    setEditingNoteId(note.id);
    setContent(noteContent(note));
    setPerformanceLevel(noteLevel(note));
    setSelectedSubjectId(note.subject?.id ?? note.subjectId ?? initialSubjectId);
  }

  async function confirmArchive(noteId: string) {
    setErrorMessage("");
    setSuccessMessage("");
    setPendingMutation({ noteId, type: "archive" });
    setIsSaving(true);
    const result = await archiveProgressNoteAction(noteId);
    setIsSaving(false);
    setConfirmArchiveId(null);

    if (!result.success) {
      clearPendingMutation();
      setErrorMessage(fieldErrorMessage(result.error));
      return;
    }

    setCurrentNotes((previous) => previous.filter((note) => note.id !== noteId));
    showSuccessMessage("Progress note archived successfully.");
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Student Progress</h2>

      {currentNotes.length === 0 ? <p>No progress notes.</p> : null}
      <ul className="space-y-2">
        {currentNotes.map((note) => {
          const isArchived = Boolean(note.archivedAt);
          const canEdit = !isArchived && note.canEdit !== false;
          return (
            <li key={note.id} className="rounded-md border p-3">
              <div className="space-y-1">
                <p className="text-sm">{noteContent(note)}</p>
                <p className="text-xs text-muted-foreground">
                  {note.subject?.name ? `${note.subject.name} · ` : ""}
                  {noteLevel(note)}
                </p>
                {note.teacherName ? <p className="text-xs">Teacher: {note.teacherName}</p> : null}
                <p className="text-xs">
                  Recorded: {displayDate(note.recordedAt ?? note.createdAt)}
                  {note.updatedAt ? ` · Updated: ${displayDate(note.updatedAt)}` : ""}
                </p>
                {isArchived ? (
                  <p aria-label="Archived" className="text-xs font-medium">
                    Read-only
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={!isHydrated || isPending}
                    onClick={() => beginEdit(note)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={!isHydrated || isPending}
                    onClick={() => setConfirmArchiveId(note.id)}
                  >
                    Archive
                  </button>
                </div>
              ) : null}
              {confirmArchiveId === note.id ? (
                <div className="mt-2">
                  <p>Archive this progress note?</p>
                  <button
                    type="button"
                    disabled={isSaving || isPending || !isHydrated}
                    onClick={() => {
                      startTransition(() => {
                        void confirmArchive(note.id);
                      });
                    }}
                  >
                    Confirm Archive
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <form onSubmit={handleFormSubmit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="progress-note-subject">Subject</label>
          <select
            id="progress-note-subject"
            name="subjectId"
            value={selectedSubjectId}
            onChange={(event) => setSelectedSubjectId(event.target.value)}
          >
            <option value="">Select subject</option>
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="progress-note-content">Progress Note</label>
          <textarea
            id="progress-note-content"
            name="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="progress-note-level">Performance Level</label>
          <select
            id="progress-note-level"
            name="performanceLevel"
            value={performanceLevel}
            onChange={(event) => setPerformanceLevel(event.target.value as NotePerformanceLevel)}
          >
            <option value="EXCELLENT">Strong</option>
            <option value="GOOD">On track</option>
            <option value="STRUGGLING">Needs support</option>
          </select>
        </div>

        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {successMessage ? <p>{successMessage}</p> : null}
        {isSaving || isPending ? <p>Saving...</p> : null}

        <button type="submit" disabled={isSaving || isPending || !isHydrated}>
          {editingNoteId ? "Save Changes" : "Save Note"}
        </button>
      </form>
    </section>
  );
}
