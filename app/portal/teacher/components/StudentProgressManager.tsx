"use client";

import { type FormEvent, useState } from "react";

import { submitProgressNoteAction } from "@/app/portal/teacher/actions/progress-actions";
import { normalizeActionResult } from "@/lib/action-result";

type NotePerformanceLevel = "EXCELLENT" | "GOOD" | "STRUGGLING";

type StudentProgressNote = {
  id: string;
  content: string;
  performanceLevel: NotePerformanceLevel;
  createdAt: string;
};

type StudentProgressManagerProps = {
  studentId: string;
  subjectId: string;
  notes: StudentProgressNote[];
};

export function StudentProgressManager({
  studentId,
  subjectId,
  notes,
}: StudentProgressManagerProps) {
  const [currentNotes, setCurrentNotes] = useState(notes);
  const [content, setContent] = useState("");
  const [performanceLevel, setPerformanceLevel] = useState<NotePerformanceLevel>("GOOD");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);
    setErrorMessage("");

    try {
      const result = await submitProgressNoteAction({
        studentId,
        subjectId,
        content,
        performanceLevel,
      });

      if (!result.success) {
        setIsSaving(false);
        if (typeof result.error === "string") {
          setErrorMessage(result.error);
        } else {
          const firstFieldMessage =
            result.error.content?.[0] ??
            result.error.performanceLevel?.[0] ??
            result.error.studentId?.[0] ??
            result.error.subjectId?.[0] ??
            "Could not save note";
          setErrorMessage(firstFieldMessage);
        }
        return;
      }

      const optimisticNote: StudentProgressNote = {
        id: result.data.id,
        content,
        performanceLevel,
        createdAt: new Date().toISOString(),
      };
      setCurrentNotes((prev) => [optimisticNote, ...prev]);
      setContent("");
      setPerformanceLevel("GOOD");
      setIsSaving(false);
    } catch {
      setIsSaving(false);
      setErrorMessage(normalizeActionResult(undefined).message);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Student Progress</h2>

      <ul className="space-y-2">
        {currentNotes.map((note) => (
          <li key={note.id} className="rounded-md border p-3">
            <p className="text-sm">{note.content}</p>
            <p className="text-xs text-muted-foreground">{note.performanceLevel}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
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
            <option value="EXCELLENT">EXCELLENT</option>
            <option value="GOOD">GOOD</option>
            <option value="STRUGGLING">STRUGGLING</option>
          </select>
        </div>

        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {isSaving ? <p>Saving...</p> : null}

        <button type="submit" disabled={isSaving}>
          Save Note
        </button>
      </form>
    </section>
  );
}
