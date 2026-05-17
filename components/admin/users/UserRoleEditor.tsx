"use client";

import { useState } from "react";

import { toggleUserStatusAction, updateUserRoleAction } from "@/app/(admin)/admin/users/actions";
import { normalizeActionResult } from "@/lib/action-result";

type UserRole = "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";

type EditableUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
};

const ROLES: UserRole[] = ["ADMIN", "TEACHER", "PARENT", "STUDENT"];

export function UserRoleEditor({ user }: { user: EditableUser }) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function changeRole(nextRole: UserRole) {
    const previousRole = role;
    setRole(nextRole);
    setError("");
    setIsPending(true);

    try {
      const result = normalizeActionResult(
        await updateUserRoleAction({ userId: user.id, role: nextRole }),
        "Something went wrong",
      );
      if (!result.success) {
        setRole(previousRole);
        setError(result.message);
      }
    } catch {
      setRole(previousRole);
      setError(normalizeActionResult(undefined).message);
    } finally {
      setIsPending(false);
    }
  }

  async function toggleStatus() {
    const nextStatus = !isActive;
    const previousStatus = isActive;
    setIsActive(nextStatus);
    setError("");
    setIsPending(true);

    try {
      const result = normalizeActionResult(
        await toggleUserStatusAction({ userId: user.id, isActive: nextStatus }),
        "Something went wrong",
      );
      if (!result.success) {
        setIsActive(previousStatus);
        setError(result.message);
      }
    } catch {
      setIsActive(previousStatus);
      setError(normalizeActionResult(undefined).message);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="min-w-0">
        <p className="font-semibold text-slate-950">{user.fullName}</p>
        <p className="break-all text-sm text-slate-600">{user.email}</p>
      </div>

      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Role
        <select
          value={role}
          onChange={(event) => void changeRole(event.target.value as UserRole)}
          disabled={isPending}
          className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2"
        >
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => void toggleStatus()}
        disabled={isPending}
        className="w-fit rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
      >
        {isActive ? "Deactivate" : "Activate"}
      </button>

      <span className={`text-xs font-semibold ${isActive ? "text-emerald-700" : "text-slate-500"}`}>
        {isActive ? "Active" : "Inactive"}
      </span>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
