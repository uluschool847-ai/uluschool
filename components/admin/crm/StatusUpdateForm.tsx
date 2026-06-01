"use client";

import { useState } from "react";

import {
  updateContactLeadStatusAction,
  updateEnquiryStatusAction,
} from "@/app/(admin)/admin/crm/actions";
import { type ActionResult, normalizeActionResult } from "@/lib/action-result";

type StatusUpdateFormProps = {
  entityType: "enquiry" | "lead";
  entityId: string;
  currentStatus: string;
  statuses: string[];
};

export function StatusUpdateForm({
  entityType,
  entityId,
  currentStatus,
  statuses,
}: StatusUpdateFormProps) {
  const [savedStatus, setSavedStatus] = useState(currentStatus);
  const [status, setStatus] = useState(currentStatus);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setIsSaving(true);

    try {
      const action =
        entityType === "enquiry" ? updateEnquiryStatusAction : updateContactLeadStatusAction;
      const result = normalizeActionResult(
        (await action({ id: entityId, status: status as never })) as Partial<ActionResult<unknown>>,
        "Something went wrong",
      );
      if (result.success) {
        setSavedStatus(status);
        setMessage(result.message || "Status updated");
      } else {
        setError(result.message);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setStatus(savedStatus);
    setMessage("");
    setError("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-slate-700" htmlFor={`status-${entityId}`}>
        Status
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          id={`status-${entityId}`}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
        >
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isSaving}
          className="min-h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          disabled={isSaving || status === savedStatus}
          onClick={handleCancel}
          className="min-h-10 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {isSaving ? <p className="text-sm text-slate-600">Saving...</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </form>
  );
}
