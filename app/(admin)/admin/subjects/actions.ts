"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createSubject,
  deleteSubject,
  setSubjectActive,
  updateSubject,
} from "@/lib/repositories/subject-repository";

export type SubjectActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required.")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase URL-safe text.");

const subjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  slug: slugSchema,
  description: z.string().trim().min(1, "Description is required."),
  priority: z.coerce
    .number({ invalid_type_error: "Priority must be numeric." })
    .int("Priority must be numeric."),
  isActive: z.boolean().default(true),
});

const subjectUpdateSchema = subjectSchema.extend({
  id: z.string().trim().min(1, "Subject id is required."),
});

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.includes("NEXT_REDIRECT")
  );
}

function isFlashMode(formData: FormData) {
  return formData.get("flash")?.toString() === "true";
}

function getRedirectTarget(formData: FormData, key: "successRedirect" | "errorRedirect") {
  const value = formData.get(key)?.toString().trim();
  return value || null;
}

function buildRedirectUrl(
  pathname: string,
  queryKey: "subjectMessage" | "subjectError",
  message: string,
) {
  return `${pathname}${pathname.includes("?") ? "&" : "?"}${queryKey}=${encodeURIComponent(message)}`;
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (error) {
    if (error instanceof Error && /static generation store missing/i.test(error.message)) {
      return;
    }
    throw error;
  }
}

function revalidateSubjectPaths() {
  safeRevalidatePath("/admin/subjects");
  safeRevalidatePath("/subjects");
  safeRevalidatePath("/curriculum");
  safeRevalidatePath("/teachers");
}

function normalizeSubjectInput(formData: FormData) {
  return {
    name: formData.get("name")?.toString() ?? "",
    slug: formData.get("slug")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    priority: formData.get("priority")?.toString() ?? "0",
    isActive: formData.get("isActive") === "true",
  };
}

function flattenFieldErrors(errors: Record<string, string[] | undefined>) {
  return Object.values(errors)
    .flat()
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function maybeRedirectSuccess(formData: FormData, message: string) {
  if (!isFlashMode(formData)) return;
  const target = getRedirectTarget(formData, "successRedirect") ?? "/admin/subjects";
  redirect(buildRedirectUrl(target, "subjectMessage", message));
}

function maybeRedirectError(formData: FormData, message: string) {
  if (!isFlashMode(formData)) return;
  const target = getRedirectTarget(formData, "errorRedirect") ?? "/admin/subjects";
  redirect(buildRedirectUrl(target, "subjectError", message));
}

function getFailureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function requireAdminForSubjectAction(fallback: string): Promise<
  | { success: true; uid: string }
  | {
      success: false;
      result: SubjectActionResult;
    }
> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    return { success: true, uid: session.uid };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    return {
      success: false,
      result: {
        success: false,
        message: getFailureMessage(error, fallback),
      },
    };
  }
}

export async function createSubjectAction(formData: FormData): Promise<SubjectActionResult> {
  const session = await requireAdminForSubjectAction("Failed to create subject.");
  if (!session.success) return session.result;

  const parsed = subjectSchema.safeParse(normalizeSubjectInput(formData));
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    maybeRedirectError(
      formData,
      flattenFieldErrors(errors) || "Please review the subject form and try again.",
    );
    return { success: false, errors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const created = await createSubject(parsed.data, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "SUBJECT_CREATED",
          targetType: "subject",
          targetId: created.id,
          before: null,
          after: created,
          meta: { actorRole: UserRole.ADMIN, subjectId: created.id },
        },
        tx,
      );
      return created;
    });

    revalidateSubjectPaths();
    maybeRedirectSuccess(formData, "Subject created.");
    return { success: true, message: "Subject created." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = getFailureMessage(error, "Failed to create subject.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export async function updateSubjectAction(formData: FormData): Promise<SubjectActionResult> {
  const session = await requireAdminForSubjectAction("Failed to update subject.");
  if (!session.success) return session.result;

  const parsed = subjectUpdateSchema.safeParse({
    id: formData.get("id")?.toString() ?? "",
    ...normalizeSubjectInput(formData),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    maybeRedirectError(
      formData,
      flattenFieldErrors(errors) || "Please review the subject form and try again.",
    );
    return { success: false, errors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await updateSubject(
        parsed.data.id,
        {
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description,
          priority: parsed.data.priority,
          isActive: parsed.data.isActive,
        },
        tx,
      );
      const auditSource = updated as typeof updated & {
        before?: unknown;
        after?: unknown;
      };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "SUBJECT_UPDATED",
          targetType: "subject",
          targetId: parsed.data.id,
          before: auditSource.before ?? { id: parsed.data.id },
          after: auditSource.after ?? updated,
          meta: { actorRole: UserRole.ADMIN, subjectId: parsed.data.id },
        },
        tx,
      );
      return updated;
    });

    revalidateSubjectPaths();
    maybeRedirectSuccess(formData, "Subject updated.");
    return { success: true, message: "Subject updated." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = getFailureMessage(error, "Failed to update subject.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export async function toggleSubjectStatusAction(formData: FormData): Promise<SubjectActionResult> {
  const session = await requireAdminForSubjectAction("Failed to update subject status.");
  if (!session.success) return session.result;

  const id = formData.get("id")?.toString().trim() ?? "";
  const isActive = formData.get("isActive") === "true";
  if (!id) {
    maybeRedirectError(formData, "Subject id is required.");
    return { success: false, message: "Subject id is required." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await setSubjectActive(id, isActive, tx);
      const auditSource = updated as typeof updated & {
        before?: unknown;
        after?: unknown;
      };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "SUBJECT_STATUS_UPDATED",
          targetType: "subject",
          targetId: id,
          before: auditSource.before ?? { id, isActive: !isActive },
          after: auditSource.after ?? updated,
          meta: { actorRole: UserRole.ADMIN, subjectId: id },
        },
        tx,
      );
    });

    revalidateSubjectPaths();
    const message = isActive ? "Subject activated." : "Subject deactivated.";
    maybeRedirectSuccess(formData, message);
    return { success: true, message };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = getFailureMessage(error, "Failed to update subject status.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export async function deleteSubjectAction(formData: FormData): Promise<SubjectActionResult> {
  const session = await requireAdminForSubjectAction("Failed to delete subject.");
  if (!session.success) return session.result;

  const id = formData.get("id")?.toString().trim() ?? "";
  if (!id) {
    maybeRedirectError(formData, "Subject id is required.");
    return { success: false, message: "Subject id is required." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const removed = await deleteSubject(id, tx);
      const auditSource = removed as typeof removed & { before?: unknown };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "SUBJECT_DELETED",
          targetType: "subject",
          targetId: id,
          before: auditSource.before ?? removed,
          after: { deleted: true },
          meta: { actorRole: UserRole.ADMIN, subjectId: id },
        },
        tx,
      );
    });

    revalidateSubjectPaths();
    maybeRedirectSuccess(formData, "Subject deleted.");
    return { success: true, message: "Subject deleted." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = getFailureMessage(error, "Failed to delete subject.");
    maybeRedirectError(formData, message);
    return { success: false, message };
  }
}

export const setSubjectActiveAction = toggleSubjectStatusAction;
