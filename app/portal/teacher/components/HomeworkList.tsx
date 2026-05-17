"use client";

import { useState } from "react";

import { archiveHomeworkAction } from "@/app/portal/teacher/actions/homework-actions";
import { type ActionResult, normalizeActionResult } from "@/lib/action-result";

type HomeworkListItem = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  className: string;
};

type HomeworkListProps = {
  assignments: HomeworkListItem[];
};

export function HomeworkList({ assignments }: HomeworkListProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");

  async function onArchive(id: string) {
    setPendingId(id);
    setFeedback("");

    try {
      const result = normalizeActionResult(
        (await archiveHomeworkAction(id)) as Partial<ActionResult<{ id: string }>>,
        "Something went wrong",
      );
      setFeedback(result.success ? result.message || "Archived" : result.message);
    } catch {
      setFeedback("Something went wrong");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section>
      {feedback ? <p>{feedback}</p> : null}
      {assignments.map((assignment) => (
        <article key={assignment.id}>
          <h3>{assignment.title}</h3>
          <p>{assignment.description}</p>
          <p>{assignment.className}</p>
          <p>{assignment.dueDate}</p>
          <button
            type="button"
            onClick={() => void onArchive(assignment.id)}
            disabled={pendingId === assignment.id}
          >
            {pendingId === assignment.id ? "Archiving..." : "Archive/Delete"}
          </button>
        </article>
      ))}
    </section>
  );
}
