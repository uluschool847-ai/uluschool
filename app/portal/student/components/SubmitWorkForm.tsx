"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { submitWorkAction } from "@/app/portal/student/actions/submission-actions";
import { normalizeActionResult } from "@/lib/action-result";

type ExistingSubmission = {
  id: string;
  contentUrl?: string | null;
  submittedWorkHref?: string | null;
  submittedAt: string | Date;
};

type SubmitWorkFormProps = {
  assignmentId: string;
  existingSubmission?: ExistingSubmission;
};

export function SubmitWorkForm({ assignmentId, existingSubmission }: SubmitWorkFormProps) {
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }
  const [contentUrl, setContentUrl] = useState(
    existingSubmission?.contentUrl ?? existingSubmission?.submittedWorkHref ?? "",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const rawResult = await submitWorkAction({
        assignmentId,
        contentUrl,
      });

      if (!rawResult.success) {
        setIsSubmitting(false);
        setErrorMessage(
          typeof rawResult.error === "string"
            ? rawResult.error
            : (rawResult.error.contentUrl?.[0] ??
                rawResult.error.assignmentId?.[0] ??
                "Invalid submission"),
        );
        return;
      }

      setIsSubmitting(false);
      setSuccessMessage(existingSubmission ? "Work updated." : "Work submitted.");
      router?.refresh();
    } catch {
      setIsSubmitting(false);
      setErrorMessage(normalizeActionResult(undefined).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1">
        <label htmlFor="submit-work-url">Work Link</label>
        <input
          id="submit-work-url"
          name="contentUrl"
          value={contentUrl}
          onChange={(event) => setContentUrl(event.target.value)}
          placeholder="https://drive.google.com/..."
        />
      </div>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {successMessage ? <output>{successMessage}</output> : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : existingSubmission ? "Resubmit" : "Submit"}
      </button>
    </form>
  );
}
