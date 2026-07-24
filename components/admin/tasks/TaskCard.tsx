"use client";

import Link from "next/link";
import { useState } from "react";

import { assignTaskAction, updateTaskStatusAction } from "@/app/(admin)/admin/tasks/actions";
import { TaskStatusToggle } from "@/components/admin/tasks/TaskStatusToggle";
import { normalizeActionResult } from "@/lib/action-result";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

const taskDueDateFormatter = new Intl.DateTimeFormat("en-KE", {
  timeZone: "Africa/Nairobi",
});

export type AdminTask = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  taskType?: string;
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string; email: string } | null;
  dueDate: Date | string;
  meta?: { enquiryId?: string; leadId?: string; href?: string } | null;
  relatedEnquiry?: { id: string; studentName: string; email?: string | null } | null;
};

export type AdminOption = {
  id: string;
  fullName: string;
  email: string;
};

function resolveTaskType(task: AdminTask) {
  if (task.taskType) return task.taskType;
  if (/stale enquiry/i.test(task.title)) return "STALE_ENQUIRY";
  return undefined;
}

function resolveMetadataLink(task: AdminTask) {
  if (task.meta?.href) return task.meta.href;
  if (task.meta?.enquiryId) return `/admin/enquiries/${task.meta.enquiryId}`;
  if (task.relatedEnquiry?.id) return `/admin/enquiries/${task.relatedEnquiry.id}`;
  return null;
}

function formatTaskDueDate(dueDate: Date | string) {
  return taskDueDateFormatter.format(new Date(dueDate));
}

export function TaskCard({
  task,
  adminOptions = [],
}: {
  task: AdminTask;
  adminOptions?: AdminOption[];
}) {
  const taskType = resolveTaskType(task);
  const isStaleEnquiry = taskType === "STALE_ENQUIRY" || taskType === "stale-enquiry";
  const metadataHref = resolveMetadataLink(task);
  const linkLabel = task.relatedEnquiry?.studentName ?? "Related enquiry";
  const [isCompleting, setIsCompleting] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [currentAssigneeId, setCurrentAssigneeId] = useState(task.assignedToId ?? "");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const currentAssignee =
    adminOptions.find((admin) => admin.id === currentAssigneeId) ??
    (task.assignedTo?.id === currentAssigneeId ? task.assignedTo : null);

  async function completeTask() {
    setFeedback(null);
    setIsCompleting(true);

    try {
      const result = normalizeActionResult(
        await updateTaskStatusAction({ taskId: task.id, status: "COMPLETED" }),
        "Something went wrong",
      );
      if (result.success) {
        setFeedback({ type: "success", message: result.message || "Task completed" });
      } else {
        setFeedback({ type: "error", message: result.message });
      }
    } catch {
      setFeedback({ type: "error", message: "Something went wrong" });
    } finally {
      setIsCompleting(false);
    }
  }

  async function updateAssignee(nextAssigneeId: string) {
    const previousAssigneeId = currentAssigneeId;
    setCurrentAssigneeId(nextAssigneeId);
    setFeedback(null);
    setIsAssigning(true);

    try {
      const result = normalizeActionResult(
        await assignTaskAction({ taskId: task.id, adminId: nextAssigneeId || null }),
        "Something went wrong",
      );
      if (result.success) {
        setFeedback({ type: "success", message: result.message || "Task assignment updated" });
      } else {
        setCurrentAssigneeId(previousAssigneeId);
        setFeedback({ type: "error", message: result.message });
      }
    } catch {
      setCurrentAssigneeId(previousAssigneeId);
      setFeedback({ type: "error", message: "Something went wrong" });
    } finally {
      setIsAssigning(false);
    }
  }

  return (
    <article
      data-testid={`task-card-${task.id}`}
      data-task-type={taskType}
      className={`rounded-lg border p-5 shadow-sm ${
        isStaleEnquiry ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{task.title}</h3>
          </div>
          <p className="text-sm text-slate-700">{task.description}</p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase text-slate-500">
            {task.priority ? <span>{task.priority}</span> : null}
            <span>{task.status}</span>
            <time dateTime={new Date(task.dueDate).toISOString()}>
              Due {formatTaskDueDate(task.dueDate)}
            </time>
            <span>Assigned: {currentAssignee?.fullName ?? "Unassigned"}</span>
          </div>
          {metadataHref ? (
            <Link
              href={metadataHref}
              className="inline-flex text-sm font-semibold text-slate-900 underline"
            >
              {linkLabel}
            </Link>
          ) : null}
          {feedback ? (
            <p
              className={
                feedback.type === "error" ? "text-sm text-red-700" : "text-sm text-emerald-700"
              }
            >
              {feedback.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {adminOptions.length > 0 ? (
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-slate-500">
              Assign admin
              <select
                value={currentAssigneeId}
                onChange={(event) => void updateAssignee(event.target.value)}
                disabled={isAssigning}
                className="min-w-44 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium normal-case text-slate-900 disabled:opacity-60"
              >
                <option value="">Unassigned</option>
                {adminOptions.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <TaskStatusToggle taskId={task.id} status={task.status} />
          {task.status === "PENDING" ? (
            <button
              type="button"
              onClick={() => void completeTask()}
              disabled={isCompleting}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
            >
              {isCompleting ? "Completing..." : "Complete"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
