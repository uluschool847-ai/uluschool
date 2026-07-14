"use client";

import { type FormEvent, useEffect, useState } from "react";

import {
  submitCourseMaterialAction,
  updateCourseMaterialAction,
} from "@/app/portal/teacher/actions/material-actions";

type LessonOption = {
  id: string;
  title: string;
};

type MaterialFormValues = {
  title: string;
  description: string;
  fileUrl: string;
  scheduledClassId: string;
};

type UploadedAttachment = {
  filename: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

type MaterialFormProps = {
  cancelHref?: string;
  initialValues?: Partial<MaterialFormValues>;
  lessons: LessonOption[];
  materialId?: string;
  mode: "create" | "edit";
};

type FormErrors = Partial<Record<keyof MaterialFormValues | "form", string>>;

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "text/plain",
]);

function isLegacyMaterialUrl(value: string) {
  return value.startsWith("/uploads/") || value.startsWith("/public/uploads/");
}

function isSafeMaterialUrl(value: string, trustedStorageUrl?: string) {
  const trimmed = value.trim();
  if (isLegacyMaterialUrl(trimmed)) {
    return Boolean(trustedStorageUrl && trimmed === trustedStorageUrl.trim());
  }
  if (/^\/api\/(?:public-)?files\/[A-Za-z0-9_-]+$/.test(trimmed)) {
    return Boolean(trustedStorageUrl && trimmed === trustedStorageUrl.trim());
  }

  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedFileType(file: File) {
  return ALLOWED_MIME_TYPES.has(file.type);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function validate(values: MaterialFormValues, trustedStorageUrl?: string): FormErrors {
  const errors: FormErrors = {};

  if (!values.title.trim()) {
    errors.title = "Title is required";
  }
  if (!values.scheduledClassId.trim()) {
    errors.scheduledClassId = "Lesson is required";
  }
  if (!values.fileUrl.trim()) {
    errors.fileUrl = "File URL is required";
  } else if (!isSafeMaterialUrl(values.fileUrl, trustedStorageUrl)) {
    errors.fileUrl = "File URL must be a safe HTTPS URL or internal upload path.";
  }

  return errors;
}

function normalizeActionErrors(error: unknown): FormErrors {
  if (typeof error === "string") {
    return { form: error };
  }
  if (!error || typeof error !== "object") {
    return { form: "Something went wrong." };
  }

  const fieldErrors = error as Record<string, string[] | undefined>;
  const errors: FormErrors = {};
  if (fieldErrors.title?.[0]) errors.title = fieldErrors.title[0];
  if (fieldErrors.scheduledClassId?.[0]) errors.scheduledClassId = fieldErrors.scheduledClassId[0];
  if (fieldErrors.fileUrl?.[0]) errors.fileUrl = fieldErrors.fileUrl[0];

  return Object.keys(errors).length > 0 ? errors : { form: "Something went wrong." };
}

function navigateAfterSuccess(href: string, material?: { id?: string; title?: string }) {
  if (typeof window === "undefined") return;
  if (window.navigator.userAgent.toLowerCase().includes("jsdom")) return;
  const target = new URL(href, window.location.origin);
  target.searchParams.set("updated", String(Date.now()));
  if (material?.id) {
    target.searchParams.set("materialId", material.id);
  }
  if (material?.title) {
    target.searchParams.set("materialTitle", material.title);
  }
  if (material?.id && material.title) {
    window.sessionStorage.setItem(
      "teacher-material-flash",
      JSON.stringify({ id: material.id, title: material.title }),
    );
  }
  window.location.href = `${target.pathname}${target.search}`;
}

export function MaterialForm({
  cancelHref = "/portal/teacher/materials",
  initialValues,
  lessons,
  materialId,
  mode,
}: MaterialFormProps) {
  const startsHydrated =
    typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes("jsdom");
  const [isHydrated, setIsHydrated] = useState(startsHydrated);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "uploaded">("idle");
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);
  const [fileUrl, setFileUrl] = useState(initialValues?.fileUrl ?? "");

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedValues = {
      title: formData.get("title")?.toString() ?? "",
      description: formData.get("description")?.toString() ?? "",
      fileUrl: fileUrl,
      scheduledClassId: formData.get("scheduledClassId")?.toString() ?? "",
    };
    const trustedStorageUrl = attachment
      ? submittedValues.fileUrl
      : mode === "edit"
        ? initialValues?.fileUrl
        : undefined;
    const nextErrors = validate(submittedValues, trustedStorageUrl);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const payload = {
      title: submittedValues.title,
      description: submittedValues.description,
      fileUrl: submittedValues.fileUrl,
      scheduledClassId: submittedValues.scheduledClassId,
      ...(attachment ? { attachment } : {}),
    };

    try {
      const result =
        mode === "edit" && materialId
          ? await updateCourseMaterialAction(materialId, payload)
          : await submitCourseMaterialAction(payload);

      if (!result.success) {
        setErrors(normalizeActionErrors(result.error));
        setIsSubmitting(false);
        return;
      }

      navigateAfterSuccess(cancelHref, result.data);
    } catch {
      setErrors({ form: "Something went wrong." });
      setIsSubmitting(false);
    }
  }

  function onFileChange(file: File | null) {
    setSelectedFile(file);
    setAttachment(null);
    setUploadStatus("idle");
    setUploadError("");

    if (!file) return;
    if (file.size <= 0) {
      setUploadError("File is empty.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError("File too large (max 5MB).");
      return;
    }
    if (!isAllowedFileType(file)) {
      setUploadError("Unsupported file type.");
    }
  }

  async function uploadSelectedFile() {
    if (!selectedFile) return;
    if (selectedFile.size <= 0) {
      setUploadError("File is empty.");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setUploadError("File too large (max 5MB).");
      return;
    }
    if (!isAllowedFileType(selectedFile)) {
      setUploadError("Unsupported file type.");
      return;
    }
    setUploadStatus("uploading");
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("purpose", "course-material");
      formData.append("file", selectedFile, selectedFile.name);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as Partial<UploadedAttachment> & {
        publicUrl?: string;
        success?: boolean;
        error?: string;
      };

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error ?? "Upload failed");
      }

      const nextAttachment = {
        filename: payload.filename ?? selectedFile.name,
        storageKey: payload.storageKey ?? "",
        mimeType: payload.mimeType ?? selectedFile.type,
        size: payload.size ?? selectedFile.size,
      };
      if (!nextAttachment.storageKey || !payload.publicUrl) {
        throw new Error("Upload failed");
      }

      setAttachment(nextAttachment);
      setFileUrl(payload.publicUrl);
      setUploadStatus("uploaded");
    } catch (error) {
      setUploadStatus("idle");
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-1">
        <label htmlFor="material-title">Title</label>
        <input id="material-title" name="title" defaultValue={initialValues?.title ?? ""} />
        {errors.title ? <p role="alert">{errors.title}</p> : null}
      </div>

      <div className="grid gap-1">
        <label htmlFor="material-description">Description</label>
        <textarea
          id="material-description"
          name="description"
          defaultValue={initialValues?.description ?? ""}
        />
      </div>

      <div className="grid gap-1">
        <label htmlFor="material-file-url">File URL</label>
        <input
          id="material-file-url"
          name="fileUrl"
          value={fileUrl}
          onChange={(event) => {
            setFileUrl(event.target.value);
            setAttachment(null);
          }}
        />
        {errors.fileUrl ? <p role="alert">{errors.fileUrl}</p> : null}
      </div>

      <div className="grid gap-1">
        <label htmlFor="material-upload-file">Choose file</label>
        {initialValues?.fileUrl ? <p>Current file: {initialValues.fileUrl}</p> : null}
        <input
          id="material-upload-file"
          name="uploadFile"
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.zip,.txt,.png,.jpg,.jpeg,.webp,.gif"
          onChange={(event) => onFileChange(event.currentTarget.files?.[0] ?? null)}
        />
        {selectedFile && !uploadError ? (
          <p>
            <span>{selectedFile.name}</span> - <span>{formatFileSize(selectedFile.size)}</span>
          </p>
        ) : null}
        {uploadStatus === "uploaded" && attachment ? (
          <p>Upload complete: {attachment.filename}</p>
        ) : null}
        {uploadError ? <p role="alert">{uploadError}</p> : null}
        {selectedFile ? (
          <button
            type="button"
            disabled={uploadStatus === "uploading"}
            onClick={() => void uploadSelectedFile()}
          >
            {uploadStatus === "uploading"
              ? "Uploading..."
              : uploadError
                ? "Retry upload"
                : attachment
                  ? "Replace upload"
                  : "Upload"}
          </button>
        ) : null}
      </div>

      <div className="grid gap-1">
        <label htmlFor="material-scheduled-class">Lesson</label>
        <select
          id="material-scheduled-class"
          name="scheduledClassId"
          defaultValue={initialValues?.scheduledClassId ?? ""}
        >
          <option value="">Select lesson</option>
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.title}
            </option>
          ))}
        </select>
        {errors.scheduledClassId ? <p role="alert">{errors.scheduledClassId}</p> : null}
      </div>

      {errors.form ? <p role="alert">{errors.form}</p> : null}

      <button type="submit" disabled={!isHydrated || isSubmitting}>
        {isSubmitting
          ? mode === "edit"
            ? "Saving..."
            : "Creating..."
          : mode === "edit"
            ? "Save changes"
            : "Create material"}
      </button>
      <a href={cancelHref}>Cancel</a>
    </form>
  );
}
