"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createUserAction } from "@/app/(admin)/admin/users/actions";
import { normalizeActionResult } from "@/lib/action-result";

type UserRole = "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";

const ROLES: UserRole[] = ["ADMIN", "TEACHER", "PARENT", "STUDENT"];

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function UserCreateForm({ defaultRole = "STUDENT" }: { defaultRole?: UserRole }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function submitForm() {
    const nextErrors: string[] = [];

    if (!fullName.trim()) {
      nextErrors.push("Full name is required.");
    }

    if (!email.trim()) {
      nextErrors.push("Email is required.");
    } else if (!isValidEmail(email)) {
      nextErrors.push("Enter a valid email address.");
    }

    setErrors(nextErrors);
    setSuccessMessage("");

    if (nextErrors.length > 0) {
      return;
    }

    setIsPending(true);

    try {
      const result = normalizeActionResult(
        await createUserAction({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          role,
        }),
        "Something went wrong",
      );

      if (!result.success || !result.data) {
        setErrors([result.message]);
        return;
      }

      setFullName("");
      setEmail("");
      setRole(defaultRole);
      setSuccessMessage(
        `Default password: ${result.data.defaultPassword}. User must change password.`,
      );
      router.refresh();
    } catch {
      setErrors([normalizeActionResult(undefined).message]);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Create User</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Full name
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            type="text"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            type="email"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {ROLES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errors.length > 0 ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      {successMessage ? (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {successMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void submitForm()}
        disabled={isPending}
        className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Creating..." : "Create User"}
      </button>
    </section>
  );
}
