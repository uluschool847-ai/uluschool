"use client";

import { Copy, X } from "lucide-react";
import { useId, useState } from "react";

type TemporaryCredentialsPanelProps = {
  email: string;
  temporaryPassword: string;
  onDismiss?: () => void;
};

export function TemporaryCredentialsPanel({
  email,
  temporaryPassword,
  onDismiss,
}: TemporaryCredentialsPanelProps) {
  const titleId = useId();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyTemporaryPassword() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-base font-semibold">
            Temporary credentials
          </h3>
          <p className="mt-1 text-sm">
            Share these credentials securely. The password will not be shown after leaving this
            page.
          </p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss temporary credentials"
            aria-label="Dismiss temporary credentials"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <div className="grid gap-1">
          <dt className="font-medium">Account email</dt>
          <dd>
            <code className="break-all font-mono">{email}</code>
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="font-medium">Temporary password</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <code className="break-all font-mono">{temporaryPassword}</code>
            <button
              type="button"
              onClick={() => void copyTemporaryPassword()}
              title="Copy temporary password"
              aria-label="Copy temporary password"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-amber-400 bg-white text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
            >
              <Copy aria-hidden="true" className="size-4" />
            </button>
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs" aria-live="polite">
        {copyStatus === "copied"
          ? "Temporary password copied."
          : copyStatus === "error"
            ? "Could not copy the temporary password."
            : ""}
      </p>
    </section>
  );
}
