"use client";

import { useState } from "react";

import { updateTaskStatusAction } from "@/app/(admin)/admin/tasks/actions";
import { normalizeActionResult } from "@/lib/action-result";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export function TaskStatusToggle({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [currentStatus, setCurrentStatus] = useState<TaskStatus>(status);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");

  if (currentStatus === "COMPLETED") {
    return <span className="text-sm font-semibold text-emerald-700">Completed</span>;
  }

  const nextStatus = currentStatus === "PENDING" ? "IN_PROGRESS" : "COMPLETED";
  const label = nextStatus === "IN_PROGRESS" ? "Start in progress" : "Complete";

  async function updateStatus() {
    setCurrentStatus(nextStatus);
    setError("");
    setIsPending(true);

    try {
      const result = normalizeActionResult(
        await updateTaskStatusAction({ taskId, status: nextStatus }),
        "Something went wrong",
      );
      if (!result.success) {
        setCurrentStatus(status);
        setError(result.message);
      }
    } catch {
      setCurrentStatus(status);
      setError("Something went wrong");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-slate-700">{currentStatus}</span>
      <button
        type="button"
        onClick={() => void updateStatus()}
        disabled={isPending}
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Updating..." : label}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
