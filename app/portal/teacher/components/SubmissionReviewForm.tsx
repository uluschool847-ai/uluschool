"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { gradeSubmissionAction } from "@/app/portal/teacher/actions/grading-actions";
import { normalizeActionResult } from "@/lib/action-result";

const MAX_SUBMISSION_FEEDBACK_LENGTH = 2000;

type SubmissionReviewFormProps = {
  initialFeedback?: string | null;
  initialGrade?: number | null;
  submissionId: string;
};

type FormErrors = {
  grade?: string;
  feedback?: string;
  form?: string;
};

function validateGrade(rawGrade: string) {
  if (!rawGrade.trim()) {
    return "Grade is required";
  }
  const parsed = Number(rawGrade);
  if (Number.isNaN(parsed) || parsed < 0) {
    return "Grade must be greater than or equal to 0";
  }
  if (parsed > 100) {
    return "Grade must be less than or equal to 100";
  }
  return null;
}

function validateFeedback(rawFeedback: string) {
  return rawFeedback.trim().length > MAX_SUBMISSION_FEEDBACK_LENGTH
    ? "Feedback must be 2000 characters or fewer"
    : null;
}

export function SubmissionReviewForm({
  initialFeedback = null,
  initialGrade = null,
  submissionId,
}: SubmissionReviewFormProps) {
  const router = useRouter();
  const [grade, setGrade] = useState(initialGrade === null ? "" : String(initialGrade));
  const [feedback, setFeedback] = useState(initialFeedback ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const gradeError = validateGrade(grade);
    if (gradeError) {
      setErrors({ grade: gradeError });
      return;
    }
    const feedbackError = validateFeedback(feedback);
    if (feedbackError) {
      setErrors({ feedback: feedbackError });
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    setSuccessMessage(null);

    try {
      const result = await gradeSubmissionAction({
        submissionId,
        grade: Number(grade),
        feedback,
      });

      if (!result.success) {
        if (typeof result.error === "string") {
          setErrors({ form: result.error });
        } else {
          setErrors({
            grade: result.error.grade?.[0],
            feedback: result.error.feedback?.[0],
          });
        }
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage("Grade saved successfully.");
      setIsSubmitting(false);
      router.push(`/portal/teacher/submissions/${submissionId}`);
    } catch {
      setErrors({ form: normalizeActionResult(undefined).message });
      setIsSubmitting(false);
    }
  }

  return (
    <form action="/portal/teacher/submissions/grade" method="post" onSubmit={onSubmit} noValidate>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="returnTo" value={`/portal/teacher/submissions/${submissionId}`} />
      <div>
        <label htmlFor={`submission-grade-${submissionId}`}>Grade / Score 0-100</label>
        <input
          id={`submission-grade-${submissionId}`}
          name="grade"
          type="number"
          min="0"
          max="100"
          placeholder="Score 0-100"
          value={grade}
          onChange={(event) => setGrade(event.target.value)}
        />
        {errors.grade ? <p role="alert">{errors.grade}</p> : null}
      </div>

      <div>
        <label htmlFor={`submission-feedback-${submissionId}`}>Feedback</label>
        <textarea
          id={`submission-feedback-${submissionId}`}
          name="feedback"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
        {errors.feedback ? <p role="alert">{errors.feedback}</p> : null}
      </div>

      {errors.form ? <p role="alert">{errors.form}</p> : null}
      {successMessage ? <output>{successMessage}</output> : null}

      <button type="submit" disabled={isSubmitting}>
        {initialGrade === null ? "Save grade" : "Update grade"}
      </button>
    </form>
  );
}
