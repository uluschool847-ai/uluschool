"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { gradeSubmissionAction } from "@/app/portal/teacher/actions/grading-actions";
import { normalizeActionResult } from "@/lib/action-result";

type SubmissionReviewFormProps = {
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
  return null;
}

export function SubmissionReviewForm({ submissionId }: SubmissionReviewFormProps) {
  const router = useRouter();
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const gradeError = validateGrade(grade);
    if (gradeError) {
      setErrors({ grade: gradeError });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

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

      router.push("/portal/teacher");
    } catch {
      setErrors({ form: normalizeActionResult(undefined).message });
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor={`submission-grade-${submissionId}`}>Grade</label>
        <input
          id={`submission-grade-${submissionId}`}
          name="grade"
          type="number"
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

      <button type="submit" disabled={isSubmitting}>
        Save Grade
      </button>
    </form>
  );
}
