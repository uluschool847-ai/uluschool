"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createUser,
  linkParentStudent,
  toggleUserStatus,
  unlinkParentStudent,
  updateUserProfile,
} from "@/lib/repositories/portal-repository";
import { findUserById } from "@/lib/repositories/user-repository";
import { mailboxSchema } from "@/lib/validations/mailbox";

export type ParentActionState = {
  success: boolean;
  message?: string;
  accountEmail?: string;
  temporaryPassword?: string;
  errors?: Record<string, string[] | undefined>;
};

const parentProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters (min 2)."),
  email: z.string().trim().min(1, "Email is required.").pipe(mailboxSchema),
});

const parentProfileUpdateSchema = parentProfileSchema.extend({
  id: z.string().min(1, "Parent id is required."),
});

const studentLinkSchema = z.object({
  parentId: z.string().min(1, "Parent id is required."),
  studentId: z.string().min(1, "Student id is required."),
});

const PARENT_TRANSACTION_OPTIONS = { timeout: 20_000 };

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.includes("NEXT_REDIRECT")
  );
}

function extractFormData(firstArg: ParentActionState | FormData, secondArg?: FormData): FormData {
  return firstArg instanceof FormData ? firstArg : (secondArg ?? new FormData());
}

function isFlashMode(formData: FormData) {
  return formData.get("flash")?.toString() === "true";
}

function getRedirectTarget(formData: FormData, key: "successRedirect" | "errorRedirect") {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function buildRedirectUrl(
  pathname: string,
  queryKey: "parentMessage" | "parentError",
  message: string,
) {
  return `${pathname}${pathname.includes("?") ? "&" : "?"}${queryKey}=${encodeURIComponent(message)}`;
}

function flattenFieldErrors(errors: Record<string, string[] | undefined>) {
  return Object.values(errors)
    .flat()
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function readPhoneWhatsapp(formData: FormData) {
  const phoneWhatsapp = formData.get("phoneWhatsapp")?.toString().trim();
  return phoneWhatsapp ? phoneWhatsapp : undefined;
}

function buildFailureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isDuplicateEmailError(error: unknown) {
  return error instanceof Error && /already exists|duplicate/i.test(error.message);
}

function isDuplicateStudentLinkError(error: unknown) {
  return error instanceof Error && /already linked|duplicate/i.test(error.message);
}

async function loadParentTarget(parentId: string) {
  const parent = await findUserById(parentId);
  if (!parent || parent.role !== UserRole.PARENT) {
    return null;
  }

  return parent;
}

async function loadStudentTarget(studentId: string) {
  const student = await findUserById(studentId);
  if (!student || student.role !== UserRole.STUDENT) {
    return null;
  }

  return student;
}

function revalidateParentPaths(parentId: string) {
  revalidatePath("/admin/parents");
  revalidatePath(`/admin/parents/${parentId}`);
  revalidatePath(`/admin/parents/${parentId}/edit`);
}

function parentProfileSnapshot(parent: {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phoneWhatsapp?: string | null;
  isActive?: boolean | null;
}) {
  return {
    id: parent.id,
    fullName: parent.fullName ?? null,
    email: parent.email ?? null,
    phoneWhatsapp: parent.phoneWhatsapp ?? null,
    isActive: parent.isActive ?? null,
  };
}

export async function createParentAction(
  prevStateOrFormData: ParentActionState | FormData,
  maybeFormData?: FormData,
): Promise<ParentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = buildFailureMessage(error, "Failed to create parent account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const parsed = parentProfileSchema.safeParse({
    fullName: formData.get("fullName")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "parentError",
          flattenFieldErrors(errors) || "Please review the parent form and try again.",
        ),
      );
    }
    return { success: false, errors };
  }

  let created: Awaited<ReturnType<typeof createUser>>;
  try {
    if (!session) throw new Error("Failed to create parent account.");
    created = await prisma.$transaction(async (tx) => {
      const data = await createUser(
        {
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          phoneWhatsapp: readPhoneWhatsapp(formData),
          role: UserRole.PARENT,
        },
        tx,
      );
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "PARENT_ACCOUNT_CREATED",
          targetType: "parent",
          targetId: data.user.id,
          before: null,
          after: parentProfileSnapshot(data.user),
          meta: {
            actorRole: UserRole.ADMIN,
            parentId: data.user.id,
          },
        },
        tx,
      );
      return data;
    }, PARENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/parents");
  } catch (error) {
    const message = buildFailureMessage(error, "Failed to create parent account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    if (isDuplicateEmailError(error)) {
      return { success: false, errors: { email: [message] } };
    }
    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "parentMessage", "Account created."));
  }

  return {
    success: true,
    message: "Account created.",
    accountEmail: created.user.email,
    temporaryPassword: created.temporaryPassword,
  };
}

export async function updateParentAction(
  prevStateOrFormData: ParentActionState | FormData,
  maybeFormData?: FormData,
): Promise<ParentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = buildFailureMessage(error, "Failed to update parent account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const parsed = parentProfileUpdateSchema.safeParse({
    id: formData.get("id")?.toString() ?? "",
    fullName: formData.get("fullName")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "parentError",
          flattenFieldErrors(errors) || "Please review the parent form and try again.",
        ),
      );
    }
    return { success: false, errors };
  }

  const target = await loadParentTarget(parsed.data.id);
  if (!target) {
    const message = "Parent account not found or not allowed.";
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  try {
    if (!session) throw new Error("Failed to update parent account.");
    await prisma.$transaction(async (tx) => {
      const updatedParent = await updateUserProfile(
        {
          userId: parsed.data.id,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          phoneWhatsapp: readPhoneWhatsapp(formData) ?? null,
        },
        tx,
      );
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "PARENT_ACCOUNT_UPDATED",
          targetType: "parent",
          targetId: parsed.data.id,
          before: parentProfileSnapshot(target),
          after: parentProfileSnapshot(updatedParent),
          meta: {
            actorRole: UserRole.ADMIN,
            parentId: parsed.data.id,
          },
        },
        tx,
      );
    }, PARENT_TRANSACTION_OPTIONS);
    revalidateParentPaths(parsed.data.id);
  } catch (error) {
    const message = buildFailureMessage(error, "Failed to update parent account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    if (isDuplicateEmailError(error)) {
      return { success: false, errors: { email: [message] } };
    }
    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "parentMessage", "Parent account updated."));
  }

  return { success: true, message: "Parent account updated." };
}

export async function toggleParentStatusAction(
  prevStateOrFormData: ParentActionState | FormData,
  maybeFormData?: FormData,
): Promise<ParentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = buildFailureMessage(error, "Failed to update parent status.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const id = formData.get("id")?.toString() ?? "";
  const isActive = formData.get("isActive") === "true";
  if (!id) {
    const message = "Parent id is required.";
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const target = await loadParentTarget(id);
  if (!target) {
    const message = "Parent account not found or not allowed.";
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  try {
    if (!session) throw new Error("Failed to update parent status.");
    await prisma.$transaction(async (tx) => {
      const updatedParent = await toggleUserStatus(id, isActive, session.uid, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "PARENT_ACCOUNT_STATUS_UPDATED",
          targetType: "parent",
          targetId: id,
          before: { isActive: target.isActive },
          after: { isActive: updatedParent.isActive },
          meta: {
            actorRole: UserRole.ADMIN,
            parentId: id,
          },
        },
        tx,
      );
    }, PARENT_TRANSACTION_OPTIONS);
    revalidateParentPaths(id);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = buildFailureMessage(error, "Failed to update parent status.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const message = isActive ? "Parent account activated." : "Parent account deactivated.";
  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "parentMessage", message));
  }

  return { success: true, message };
}

export async function linkParentStudentAction(
  prevStateOrFormData: ParentActionState | FormData,
  maybeFormData?: FormData,
): Promise<ParentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = buildFailureMessage(error, "Failed to link student account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const parsed = studentLinkSchema.safeParse({
    parentId: formData.get("parentId")?.toString() ?? "",
    studentId: formData.get("studentId")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "parentError",
          flattenFieldErrors(errors) || "Please review the student link form and try again.",
        ),
      );
    }
    return { success: false, errors };
  }

  const parent = await loadParentTarget(parsed.data.parentId);
  if (!parent) {
    const message = "Parent account not found or not allowed.";
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const student = await loadStudentTarget(parsed.data.studentId);
  if (!student) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  try {
    if (!session) throw new Error("Failed to link student account.");
    await prisma.$transaction(async (tx) => {
      await linkParentStudent(parsed.data.parentId, parsed.data.studentId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "PARENT_STUDENT_LINKED",
          targetType: "parent",
          targetId: parsed.data.parentId,
          before: { studentId: null },
          after: { studentId: parsed.data.studentId, studentName: student.fullName },
          meta: {
            actorRole: UserRole.ADMIN,
            parentId: parsed.data.parentId,
            studentId: parsed.data.studentId,
          },
        },
        tx,
      );
    }, PARENT_TRANSACTION_OPTIONS);
    revalidateParentPaths(parsed.data.parentId);
    revalidatePath("/admin/students");
  } catch (error) {
    const message = buildFailureMessage(error, "Failed to link student account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    if (isDuplicateStudentLinkError(error)) {
      return { success: false, errors: { studentId: [message] } };
    }
    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "parentMessage", "Student linked."));
  }

  return { success: true, message: "Student linked." };
}

export async function unlinkParentStudentAction(
  prevStateOrFormData: ParentActionState | FormData,
  maybeFormData?: FormData,
): Promise<ParentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = buildFailureMessage(error, "Failed to unlink student account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const parsed = studentLinkSchema.safeParse({
    parentId: formData.get("parentId")?.toString() ?? "",
    studentId: formData.get("studentId")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "parentError",
          flattenFieldErrors(errors) || "Please review the student link form and try again.",
        ),
      );
    }
    return { success: false, errors };
  }

  const parent = await loadParentTarget(parsed.data.parentId);
  if (!parent) {
    const message = "Parent account not found or not allowed.";
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  const student = await loadStudentTarget(parsed.data.studentId);
  if (!student) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  try {
    if (!session) throw new Error("Failed to unlink student account.");
    await prisma.$transaction(async (tx) => {
      await unlinkParentStudent(parsed.data.parentId, parsed.data.studentId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "PARENT_STUDENT_UNLINKED",
          targetType: "parent",
          targetId: parsed.data.parentId,
          before: { studentId: parsed.data.studentId, studentName: student.fullName },
          after: { studentId: null },
          meta: {
            actorRole: UserRole.ADMIN,
            parentId: parsed.data.parentId,
            studentId: parsed.data.studentId,
          },
        },
        tx,
      );
    }, PARENT_TRANSACTION_OPTIONS);
    revalidateParentPaths(parsed.data.parentId);
    revalidatePath("/admin/students");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = buildFailureMessage(error, "Failed to unlink student account.");
    if (flashMode && errorRedirect)
      redirect(buildRedirectUrl(errorRedirect, "parentError", message));
    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "parentMessage", "Student unlinked."));
  }

  return { success: true, message: "Student unlinked." };
}
