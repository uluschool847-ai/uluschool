"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  editHomeworkAction,
  submitHomeworkAction,
} from "@/app/portal/teacher/actions/homework-actions";
import { normalizeActionResult } from "@/lib/action-result";

type ClassOption = {
  id: string;
  name: string;
};

type HomeworkFormValues = {
  title: string;
  description: string;
  classId: string;
  dueDate: string;
};

type HomeworkFormProps = {
  mode: "create" | "edit";
  classes: ClassOption[];
  assignmentId?: string;
  initialValues?: Partial<HomeworkFormValues>;
};

type FormErrors = Partial<Record<keyof HomeworkFormValues | "form", string>>;

function validate(values: HomeworkFormValues): FormErrors {
  const errors: FormErrors = {};

  if (!values.title.trim()) {
    errors.title = "Title is required";
  }
  if (!values.classId.trim()) {
    errors.classId = "Class is required";
  }
  if (!values.dueDate.trim()) {
    errors.dueDate = "Due date is required";
  } else if (Number.isNaN(new Date(values.dueDate).getTime())) {
    errors.dueDate = "Due date is invalid";
  }

  return errors;
}

function normalizeActionError(error: unknown): FormErrors {
  if (!error || typeof error !== "object") {
    return { form: "Something went wrong." };
  }

  const maybeFieldErrors = error as Record<string, string[] | undefined>;
  const errors: FormErrors = {};

  if (maybeFieldErrors.title?.[0]) {
    errors.title = maybeFieldErrors.title[0];
  }
  if (maybeFieldErrors.classId?.[0]) {
    errors.classId = maybeFieldErrors.classId[0];
  }
  if (maybeFieldErrors.dueDate?.[0]) {
    errors.dueDate = maybeFieldErrors.dueDate[0];
  }

  if (!errors.title && !errors.classId && !errors.dueDate) {
    errors.form = "Something went wrong.";
  }

  return errors;
}

export function HomeworkForm({ mode, classes, assignmentId, initialValues }: HomeworkFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<HomeworkFormValues>({
    title: initialValues?.title ?? "",
    description: initialValues?.description ?? "",
    classId: initialValues?.classId ?? "",
    dueDate: initialValues?.dueDate ?? "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const payload = {
      title: values.title,
      description: values.description,
      classId: values.classId,
      dueDate: values.dueDate,
    };

    try {
      const result =
        mode === "edit" && assignmentId
          ? await editHomeworkAction(assignmentId, payload)
          : await submitHomeworkAction(payload);

      if (!result.success) {
        setErrors(normalizeActionError(result.error));
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
        <label htmlFor="homework-title">Title</label>
        <input
          id="homework-title"
          name="title"
          value={values.title}
          onChange={(event) => setValues((prev) => ({ ...prev, title: event.target.value }))}
        />
        {errors.title ? <p role="alert">{errors.title}</p> : null}
      </div>

      <div>
        <label htmlFor="homework-description">Description</label>
        <textarea
          id="homework-description"
          name="description"
          value={values.description}
          onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
        />
      </div>

      <div>
        <label htmlFor="homework-class">Class</label>
        <select
          id="homework-class"
          name="classId"
          value={values.classId}
          onChange={(event) => setValues((prev) => ({ ...prev, classId: event.target.value }))}
        >
          <option value="">Select class</option>
          {classes.map((classOption) => (
            <option key={classOption.id} value={classOption.id}>
              {classOption.name}
            </option>
          ))}
        </select>
        {errors.classId ? <p role="alert">{errors.classId}</p> : null}
      </div>

      <div>
        <label htmlFor="homework-due-date">Due Date</label>
        <input
          id="homework-due-date"
          type="date"
          name="dueDate"
          value={values.dueDate}
          onChange={(event) => setValues((prev) => ({ ...prev, dueDate: event.target.value }))}
        />
        {errors.dueDate ? <p role="alert">{errors.dueDate}</p> : null}
      </div>

      {errors.form ? <p role="alert">{errors.form}</p> : null}

      <button type="submit" disabled={isSubmitting}>
        {mode === "edit" ? "Save Changes" : "Create Homework"}
      </button>
    </form>
  );
}
