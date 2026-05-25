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
  classGroupName?: string | null;
  subjectName?: string | null;
  submissionsCount?: number;
  pendingSubmissionsCount?: number;
  gradedSubmissionsCount?: number;
  archivedAt?: string | Date | null;
  editHref?: string;
  submissionsHref?: string | null;
};

type HomeworkListProps = {
  assignments: HomeworkListItem[];
  status?: "active" | "archived" | "all";
};

function isArchived(assignment: HomeworkListItem) {
  return Boolean(assignment.archivedAt);
}

export function HomeworkList({ assignments, status = "all" }: HomeworkListProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [locallyArchivedIds, setLocallyArchivedIds] = useState<Set<string>>(new Set());
  const visibleAssignments =
    status === "active"
      ? assignments.filter(
          (assignment) => !isArchived(assignment) && !locallyArchivedIds.has(assignment.id),
        )
      : assignments;

  async function onArchive(id: string) {
    setPendingId(id);
    setFeedback("");

    try {
      const result = normalizeActionResult(
        (await archiveHomeworkAction(id)) as Partial<ActionResult<{ id: string }>>,
        "Something went wrong",
      );
      setFeedback(result.success ? result.message || "Archived" : result.message);
      if (result.success) {
        setLocallyArchivedIds((previous) => new Set(previous).add(id));
      }
    } catch {
      setFeedback("Something went wrong");
    } finally {
      setPendingId(null);
      setConfirmId(null);
    }
  }

  return (
    <section>
      {feedback ? <p>{feedback}</p> : null}
      {visibleAssignments.map((assignment) => (
        <article key={assignment.id}>
          <h3>{assignment.title}</h3>
          <p>{isArchived(assignment) ? "Archived" : "Active"}</p>
          <p>{assignment.description}</p>
          <p>{assignment.classGroupName ?? assignment.className}</p>
          {assignment.subjectName ? <p>Subject: {assignment.subjectName}</p> : null}
          <p>{assignment.dueDate}</p>
          <p>Submissions: {assignment.submissionsCount ?? 0}</p>
          <p>Pending: {assignment.pendingSubmissionsCount ?? 0}</p>
          <p>Graded: {assignment.gradedSubmissionsCount ?? 0}</p>
          {!isArchived(assignment) ? (
            <a href={assignment.editHref ?? `/portal/teacher/assignments/${assignment.id}/edit`}>
              Edit
            </a>
          ) : null}
          {assignment.submissionsHref ? (
            <a href={assignment.submissionsHref}>View submissions</a>
          ) : (
            <button type="button" disabled>
              View submissions
            </button>
          )}
          {!isArchived(assignment) ? (
            confirmId === assignment.id ? (
              <div>
                <p>Archive this homework assignment?</p>
                <button
                  type="button"
                  onClick={() => void onArchive(assignment.id)}
                  disabled={pendingId === assignment.id}
                >
                  {pendingId === assignment.id ? "Archiving..." : "Confirm archive"}
                </button>
                <button type="button" onClick={() => setConfirmId(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmId(assignment.id)}>
                Archive
              </button>
            )
          ) : null}
        </article>
      ))}
    </section>
  );
}
