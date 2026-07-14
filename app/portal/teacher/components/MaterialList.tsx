"use client";

import { useEffect, useState } from "react";

import {
  deleteCourseMaterialAction,
  unlinkAttachmentAction,
} from "@/app/portal/teacher/actions/material-actions";
import { type ActionResult, normalizeActionResult } from "@/lib/action-result";

type MaterialListItem = {
  id: string;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  className?: string | null;
  lessonTitle?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  editHref?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    storageKey?: string | null;
    publicUrl?: string | null;
  }>;
};

type MaterialAttachment = NonNullable<MaterialListItem["attachments"]>[number];

type MaterialListProps = {
  materials: MaterialListItem[];
};

function isSafeMaterialUrl(value: string | null | undefined) {
  if (!value) return false;
  if (/^\/api\/files\/[A-Za-z0-9_-]+$/.test(value)) return true;
  if (value.startsWith("/uploads/")) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function attachmentUrl(attachment: MaterialAttachment) {
  const value = attachment.publicUrl ?? null;
  return isSafeMaterialUrl(value) ? value : null;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

export function MaterialList({ materials }: MaterialListProps) {
  const [materialItems, setMaterialItems] = useState(materials);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAttachmentId, setConfirmAttachmentId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAttachmentId, setPendingAttachmentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const visibleMaterials = materialItems.filter((material) => !deletedIds.has(material.id));

  useEffect(() => {
    let nextMaterials = materials;
    const flash = window.sessionStorage.getItem("teacher-material-flash");

    if (flash) {
      window.sessionStorage.removeItem("teacher-material-flash");
      try {
        const parsed = JSON.parse(flash) as { id?: string; title?: string };
        if (parsed.id && parsed.title) {
          let matched = false;
          nextMaterials = materials.map((material) => {
            if (material.id !== parsed.id) return material;
            matched = true;
            return { ...material, title: parsed.title ?? material.title };
          });

          if (!matched) {
            nextMaterials = [
              {
                id: parsed.id,
                title: parsed.title,
                description: "",
                fileUrl: null,
                className: null,
                lessonTitle: "Lesson",
                createdAt: null,
                updatedAt: null,
                editHref: `/portal/teacher/materials/${parsed.id}/edit`,
              },
              ...nextMaterials,
            ];
          }
        }
      } catch {
        nextMaterials = materials;
      }
    }

    setMaterialItems(nextMaterials);
  }, [materials]);

  async function onDelete(id: string) {
    setPendingId(id);
    setFeedback("");

    try {
      const result = normalizeActionResult(
        (await deleteCourseMaterialAction(id)) as Partial<ActionResult>,
        "Failed to delete material",
      );
      if (result.success) {
        setFeedback(result.message || "Material deleted");
        setDeletedIds((previous) => new Set(previous).add(id));
      } else {
        setFeedback(result.message);
      }
    } catch {
      setFeedback("Failed to delete material");
    } finally {
      setPendingId(null);
      setConfirmId(null);
    }
  }

  async function onUnlinkAttachment(materialId: string, attachmentId: string) {
    setPendingAttachmentId(attachmentId);
    setFeedback("");

    try {
      const result = normalizeActionResult(
        (await unlinkAttachmentAction({ materialId, attachmentId })) as Partial<ActionResult>,
        "Failed to remove attachment",
      );
      if (result.success) {
        setFeedback(result.message || "Attachment deleted");
        setMaterialItems((previous) =>
          previous.map((material) =>
            material.id === materialId
              ? {
                  ...material,
                  attachments: material.attachments?.filter(
                    (attachment) => attachment.id !== attachmentId,
                  ),
                }
              : material,
          ),
        );
      } else {
        setFeedback(result.message);
      }
    } catch {
      setFeedback("Failed to remove attachment");
    } finally {
      setPendingAttachmentId(null);
      setConfirmAttachmentId(null);
    }
  }

  if (visibleMaterials.length === 0) {
    return (
      <section>
        {feedback ? <p>{feedback}</p> : null}
        <p>No materials found.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {feedback ? <p>{feedback}</p> : null}
      {visibleMaterials.map((material) => {
        const safeFileUrl = isSafeMaterialUrl(material.fileUrl) ? material.fileUrl : null;
        const primaryAttachment = material.attachments?.[0] ?? null;
        const safeAttachmentUrl = primaryAttachment ? attachmentUrl(primaryAttachment) : null;

        return (
          <article key={material.id} className="rounded-lg border border-secondary p-4">
            <div className="space-y-1">
              <p className="font-medium">{material.title}</p>
              {material.description ? <p>{material.description}</p> : null}
              {material.className ? <p>Class/group: {material.className}</p> : null}
              {material.lessonTitle ? <p>Lesson: {material.lessonTitle}</p> : null}
              <p>Created: {formatDate(material.createdAt)}</p>
              <p>Updated: {formatDate(material.updatedAt)}</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {safeAttachmentUrl && primaryAttachment ? (
                <a href={safeAttachmentUrl} target="_blank" rel="noreferrer">
                  View {primaryAttachment.filename}
                </a>
              ) : safeFileUrl ? (
                <a href={safeFileUrl} target="_blank" rel="noreferrer">
                  View file
                </a>
              ) : (
                <span>File unavailable</span>
              )}
              <a href={material.editHref ?? `/portal/teacher/materials/${material.id}/edit`}>
                Edit
              </a>
              {confirmId === material.id ? (
                <span className="flex flex-wrap gap-2">
                  <span>Delete this material?</span>
                  <button
                    type="button"
                    disabled={pendingId === material.id}
                    onClick={() => void onDelete(material.id)}
                  >
                    {pendingId === material.id ? "Deleting..." : "Confirm delete"}
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmId(material.id)}>
                  Delete
                </button>
              )}
            </div>
            {primaryAttachment ? (
              <div className="mt-3">
                <p>{primaryAttachment.filename}</p>
                {confirmAttachmentId === primaryAttachment.id ? (
                  <span className="flex flex-wrap gap-2">
                    <span>Remove attachment?</span>
                    <button
                      type="button"
                      disabled={pendingAttachmentId === primaryAttachment.id}
                      onClick={() => void onUnlinkAttachment(material.id, primaryAttachment.id)}
                    >
                      {pendingAttachmentId === primaryAttachment.id
                        ? "Removing..."
                        : "Confirm remove"}
                    </button>
                    <button type="button" onClick={() => setConfirmAttachmentId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAttachmentId(primaryAttachment.id)}
                  >
                    Remove attachment
                  </button>
                )}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
