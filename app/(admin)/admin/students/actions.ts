"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { findById as findClassById } from "@/lib/repositories/class-repository";
import {
  createUser,
  linkStudentClass,
  linkStudentParent,
  toggleUserStatus,
  unlinkStudentClass,
  unlinkStudentParent,
  updateStudentLearningStatus,
  updateUserProfile,
} from "@/lib/repositories/portal-repository";
import { findUserById } from "@/lib/repositories/user-repository";

export type StudentActionState = {
  success: boolean;
  message?: string;
  accountEmail?: string;
  temporaryPassword?: string;
  errors?: Record<string, string[] | undefined>;
};

const studentProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters (min 2)."),
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
});

const studentProfileUpdateSchema = studentProfileSchema.extend({
  id: z.string().min(1, "Student id is required."),
});

const parentLinkSchema = z.object({
  studentId: z.string().min(1, "Student id is required."),
  parentId: z.string().min(1, "Parent id is required."),
});

const classEnrollmentSchema = z.object({
  studentId: z.string().min(1, "Student id is required."),
  classId: z.string().min(1, "Class id is required."),
});

const studentLearningStatusSchema = z.object({
  id: z.string().min(1, "Student id is required."),
  learningStatus: z.enum(["TRIAL", "ACTIVE", "PAUSED", "INACTIVE"], {
    message: "Invalid learning status.",
  }),
});

const STUDENT_TRANSACTION_OPTIONS = { timeout: 20_000 };

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
  return value ? value : null;
}

function buildRedirectUrl(
  pathname: string,
  queryKey: "studentMessage" | "studentError",
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

function extractFormData(firstArg: StudentActionState | FormData, secondArg?: FormData): FormData {
  return firstArg instanceof FormData ? firstArg : (secondArg ?? new FormData());
}

function readPhoneWhatsapp(formData: FormData) {
  const phoneWhatsapp = formData.get("phoneWhatsapp")?.toString().trim();
  return phoneWhatsapp ? phoneWhatsapp : undefined;
}

function isDuplicateEmailError(error: unknown) {
  return error instanceof Error && /already exists|duplicate/i.test(error.message);
}

function isDuplicateParentLinkError(error: unknown) {
  return error instanceof Error && /already linked|duplicate/i.test(error.message);
}

function isDuplicateClassEnrollmentError(error: unknown) {
  return error instanceof Error && /already enrolled|duplicate/i.test(error.message);
}

function buildFailureMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getLearningStatus(user: unknown) {
  return typeof user === "object" && user !== null && "learningStatus" in user
    ? (user as { learningStatus?: unknown }).learningStatus
    : null;
}

function studentProfileSnapshot(student: {
  id: string;
  fullName?: string | null;
  email?: string | null;
  phoneWhatsapp?: string | null;
  role?: UserRole | string | null;
  learningStatus?: string | null;
}) {
  return {
    id: student.id,
    fullName: student.fullName ?? null,
    email: student.email ?? null,
    phoneWhatsapp: student.phoneWhatsapp ?? null,
    role: student.role ?? UserRole.STUDENT,
    learningStatus: student.learningStatus ?? "ACTIVE",
  };
}

async function loadStudentTarget(studentId: string) {
  const student = await findUserById(studentId);
  if (!student || student.role !== UserRole.STUDENT) {
    return null;
  }

  return student;
}

async function loadParentTarget(parentId: string) {
  const parent = await findUserById(parentId);
  if (!parent || parent.role !== UserRole.PARENT) {
    return null;
  }

  return parent;
}

async function loadClassTarget(classId: string) {
  const scheduledClass = await findClassById(classId);
  if (!scheduledClass) {
    return null;
  }

  return scheduledClass;
}

export async function createStudentAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to create student account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parsed = studentProfileSchema.safeParse({
    fullName: formData.get("fullName")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "studentError",
          flattenFieldErrors(errors) || "Please review the student form and try again.",
        ),
      );
    }

    return { success: false, errors };
  }

  let created: Awaited<ReturnType<typeof createUser>>;
  try {
    if (!session) {
      throw new Error("Failed to create student account.");
    }
    created = await prisma.$transaction(async (tx) => {
      const data = await createUser(
        {
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          phoneWhatsapp: readPhoneWhatsapp(formData),
          role: UserRole.STUDENT,
        },
        tx,
      );
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_ACCOUNT_CREATED",
          targetType: "student",
          targetId: data.user.id,
          before: null,
          after: studentProfileSnapshot(data.user),
          meta: {
            actorRole: UserRole.ADMIN,
            studentId: data.user.id,
          },
        },
        tx,
      );
      return data;
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
  } catch (error) {
    const message = buildFailureMessage(error, "Failed to create student account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    if (isDuplicateEmailError(error)) {
      return {
        success: false,
        errors: {
          email: [message],
        },
      };
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "studentMessage", "Account created."));
  }

  return {
    success: true,
    message: "Account created.",
    accountEmail: created.user.email,
    temporaryPassword: created.temporaryPassword,
  };
}

export async function updateStudentAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to update student account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parsed = studentProfileUpdateSchema.safeParse({
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
          "studentError",
          flattenFieldErrors(errors) || "Please review the student form and try again.",
        ),
      );
    }

    return { success: false, errors };
  }

  const target = await loadStudentTarget(parsed.data.id);
  if (!target) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }
    return { success: false, message };
  }

  try {
    if (!session) {
      throw new Error("Failed to update student account.");
    }
    await prisma.$transaction(async (tx) => {
      const updatedStudent = await updateUserProfile(
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
          action: "STUDENT_PROFILE_UPDATED",
          targetType: "student",
          targetId: parsed.data.id,
          before: {
            id: target.id,
            fullName: target.fullName,
            email: target.email,
            phoneWhatsapp: (target as { phoneWhatsapp?: string | null }).phoneWhatsapp ?? null,
          },
          after: {
            id: updatedStudent.id,
            fullName: updatedStudent.fullName,
            email: updatedStudent.email,
            phoneWhatsapp: updatedStudent.phoneWhatsapp,
          },
          meta: {
            actorRole: UserRole.ADMIN,
            studentId: parsed.data.id,
          },
        },
        tx,
      );
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${parsed.data.id}`);
  } catch (error) {
    const message = buildFailureMessage(error, "Failed to update student account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    if (isDuplicateEmailError(error)) {
      return {
        success: false,
        errors: {
          email: [message],
        },
      };
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "studentMessage", "Student account updated."));
  }

  return { success: true, message: "Student account updated." };
}

export async function toggleStudentStatusAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to update student status.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const id = formData.get("id")?.toString() ?? "";
  const isActive = formData.get("isActive") === "true";
  if (!id) {
    const message = "Student id is required.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }
    return { success: false, message };
  }

  const target = await loadStudentTarget(id);
  if (!target) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }
    return { success: false, message };
  }

  try {
    if (!session) {
      throw new Error("Failed to update student status.");
    }
    await prisma.$transaction(async (tx) => {
      await toggleUserStatus(id, isActive, session.uid, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_ACCOUNT_STATUS_UPDATED",
          targetType: "student",
          targetId: id,
          before: { isActive: target.isActive },
          after: { isActive },
          meta: { actorRole: UserRole.ADMIN, studentId: id },
        },
        tx,
      );
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to update student status.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(
      buildRedirectUrl(
        successRedirect,
        "studentMessage",
        isActive ? "Student account activated." : "Student account deactivated.",
      ),
    );
  }

  return {
    success: true,
    message: isActive ? "Student account activated." : "Student account deactivated.",
  };
}

export async function updateStudentLearningStatusAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to update student learning status.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parsed = studentLearningStatusSchema.safeParse({
    id: formData.get("id")?.toString() ?? "",
    learningStatus: formData.get("learningStatus")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "studentError",
          flattenFieldErrors(errors) || "Please review the learning status form and try again.",
        ),
      );
    }

    return { success: false, errors };
  }

  const target = await loadStudentTarget(parsed.data.id);
  if (!target) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  try {
    if (!session) {
      throw new Error("Failed to update student learning status.");
    }
    await prisma.$transaction(async (tx) => {
      await updateStudentLearningStatus(parsed.data.id, parsed.data.learningStatus, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_LEARNING_STATUS_UPDATED",
          targetType: "student",
          targetId: parsed.data.id,
          before: { learningStatus: getLearningStatus(target) },
          after: { learningStatus: parsed.data.learningStatus },
          meta: { actorRole: UserRole.ADMIN, studentId: parsed.data.id },
        },
        tx,
      );
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${parsed.data.id}`);
    revalidatePath(`/admin/students/${parsed.data.id}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to update student learning status.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(
      buildRedirectUrl(successRedirect, "studentMessage", "Student learning status updated."),
    );
  }

  return { success: true, message: "Student learning status updated." };
}

export async function linkStudentParentAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to link parent account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parsed = parentLinkSchema.safeParse({
    studentId: formData.get("studentId")?.toString() ?? "",
    parentId: formData.get("parentId")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "studentError",
          flattenFieldErrors(errors) || "Please review the parent link form and try again.",
        ),
      );
    }

    return { success: false, errors };
  }

  const student = await loadStudentTarget(parsed.data.studentId);
  if (!student) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parent = await loadParentTarget(parsed.data.parentId);
  if (!parent) {
    const message = "Parent account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  try {
    if (!session) {
      throw new Error("Failed to link parent account.");
    }

    await prisma.$transaction(async (tx) => {
      await linkStudentParent(parsed.data.studentId, parsed.data.parentId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_PARENT_LINKED",
          targetType: "student",
          targetId: parsed.data.studentId,
          before: { parentId: null },
          after: { parentId: parsed.data.parentId, parentName: parent.fullName },
          meta: {
            actorRole: UserRole.ADMIN,
            studentId: parsed.data.studentId,
            parentId: parsed.data.parentId,
          },
        },
        tx,
      );
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${parsed.data.studentId}`);
    revalidatePath(`/admin/students/${parsed.data.studentId}/edit`);
  } catch (error) {
    const message = buildFailureMessage(error, "Failed to link parent account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    if (isDuplicateParentLinkError(error)) {
      return {
        success: false,
        errors: {
          parentId: [message],
        },
      };
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "studentMessage", "Parent linked."));
  }

  return { success: true, message: "Parent linked." };
}

export async function unlinkStudentParentAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to unlink parent account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parsed = parentLinkSchema.safeParse({
    studentId: formData.get("studentId")?.toString() ?? "",
    parentId: formData.get("parentId")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "studentError",
          flattenFieldErrors(errors) || "Please review the parent link form and try again.",
        ),
      );
    }

    return { success: false, errors };
  }

  const student = await loadStudentTarget(parsed.data.studentId);
  if (!student) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parent = await loadParentTarget(parsed.data.parentId);
  if (!parent) {
    const message = "Parent account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  try {
    if (!session) {
      throw new Error("Failed to unlink parent account.");
    }

    await prisma.$transaction(async (tx) => {
      await unlinkStudentParent(parsed.data.studentId, parsed.data.parentId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_PARENT_UNLINKED",
          targetType: "student",
          targetId: parsed.data.studentId,
          before: { parentId: parsed.data.parentId, parentName: parent.fullName },
          after: { parentId: null },
          meta: {
            actorRole: UserRole.ADMIN,
            studentId: parsed.data.studentId,
            parentId: parsed.data.parentId,
          },
        },
        tx,
      );
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${parsed.data.studentId}`);
    revalidatePath(`/admin/students/${parsed.data.studentId}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to unlink parent account.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "studentMessage", "Parent unlinked."));
  }

  return { success: true, message: "Parent unlinked." };
}

export async function linkStudentClassAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to link class enrollment.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parsed = classEnrollmentSchema.safeParse({
    studentId: formData.get("studentId")?.toString() ?? "",
    classId: formData.get("classId")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "studentError",
          flattenFieldErrors(errors) || "Please review the class enrollment form and try again.",
        ),
      );
    }

    return { success: false, errors };
  }

  const student = await loadStudentTarget(parsed.data.studentId);
  if (!student) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const scheduledClass = await loadClassTarget(parsed.data.classId);
  if (!scheduledClass) {
    const message = "Class not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  try {
    if (!session) {
      throw new Error("Failed to link class enrollment.");
    }

    await prisma.$transaction(async (tx) => {
      await linkStudentClass(parsed.data.studentId, parsed.data.classId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_CLASS_ENROLLED",
          targetType: "student",
          targetId: parsed.data.studentId,
          before: { classId: null },
          after: { classId: parsed.data.classId, classTitle: scheduledClass.title },
          meta: {
            actorRole: UserRole.ADMIN,
            studentId: parsed.data.studentId,
            classId: parsed.data.classId,
          },
        },
        tx,
      );
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${parsed.data.studentId}`);
    revalidatePath(`/admin/students/${parsed.data.studentId}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to link class enrollment.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    if (isDuplicateClassEnrollmentError(error)) {
      return {
        success: false,
        errors: {
          classId: [message],
        },
      };
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "studentMessage", "Class enrolled."));
  }

  return { success: true, message: "Class enrolled." };
}

export async function unlinkStudentClassAction(
  prevStateOrFormData: StudentActionState | FormData,
  maybeFormData?: FormData,
): Promise<StudentActionState> {
  const formData = extractFormData(prevStateOrFormData, maybeFormData);
  const flashMode = isFlashMode(formData);
  const successRedirect = getRedirectTarget(formData, "successRedirect");
  const errorRedirect = getRedirectTarget(formData, "errorRedirect");

  let session: { uid: string } | null = null;
  try {
    session = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to unlink class enrollment.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const parsed = classEnrollmentSchema.safeParse({
    studentId: formData.get("studentId")?.toString() ?? "",
    classId: formData.get("classId")?.toString() ?? "",
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "studentError",
          flattenFieldErrors(errors) || "Please review the class enrollment form and try again.",
        ),
      );
    }

    return { success: false, errors };
  }

  const student = await loadStudentTarget(parsed.data.studentId);
  if (!student) {
    const message = "Student account not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  const scheduledClass = await loadClassTarget(parsed.data.classId);
  if (!scheduledClass) {
    const message = "Class not found or not allowed.";
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  try {
    if (!session) {
      throw new Error("Failed to unlink class enrollment.");
    }

    await prisma.$transaction(async (tx) => {
      await unlinkStudentClass(parsed.data.studentId, parsed.data.classId, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "STUDENT_CLASS_UNENROLLED",
          targetType: "student",
          targetId: parsed.data.studentId,
          before: { classId: parsed.data.classId, classTitle: scheduledClass.title },
          after: { classId: null },
          meta: {
            actorRole: UserRole.ADMIN,
            studentId: parsed.data.studentId,
            classId: parsed.data.classId,
          },
        },
        tx,
      );
    }, STUDENT_TRANSACTION_OPTIONS);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${parsed.data.studentId}`);
    revalidatePath(`/admin/students/${parsed.data.studentId}/edit`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const message = buildFailureMessage(error, "Failed to unlink class enrollment.");
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "studentError", message));
    }

    return { success: false, message };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "studentMessage", "Class unlinked."));
  }

  return { success: true, message: "Class unlinked." };
}
