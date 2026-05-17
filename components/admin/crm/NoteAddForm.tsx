"use client";

import { useState } from "react";

import { addContactLeadNoteAction, addEnquiryNoteAction } from "@/app/(admin)/admin/crm/actions";
import { type ActionResult, normalizeActionResult } from "@/lib/action-result";

type NoteAddFormProps = {
  entityType: "enquiry" | "lead";
  entityId: string;
};

export function NoteAddForm({ entityType, entityId }: NoteAddFormProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmed = content.trim();
    if (!trimmed) {
      setError("Note is required");
      return;
    }

    setIsPending(true);

    try {
      const action = entityType === "enquiry" ? addEnquiryNoteAction : addContactLeadNoteAction;
      const result = normalizeActionResult(
        (await action({ id: entityId, content: trimmed })) as Partial<ActionResult<unknown>>,
        "Something went wrong",
      );
      if (result.success) {
        setContent("");
        setMessage(result.message || "Note added");
      } else {
        setError(result.message);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-slate-700" htmlFor={`note-${entityId}`}>
        Note
      </label>
      <textarea
        id={`note-${entityId}`}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={4}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {isPending ? <p className="text-sm text-slate-600">Saving...</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Add note"}
      </button>
    </form>
  );
}
