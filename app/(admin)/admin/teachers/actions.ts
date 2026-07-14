"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  createTeacher,
  deleteTeacher,
  setTeacherActive,
  updateTeacher,
} from "@/lib/repositories/cms-repository";
import { createStorageService, publicTeacherPhotoNamespace } from "@/lib/storage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpg", "image/jpeg", "image/png", "image/webp"]);

export type TeacherActionState = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const teacherSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters (min 2)."),
  title: z.string().trim().min(2, "Title must be at least 2 characters (min 2)."),
  bio: z.string().trim().min(20, "Bio must be at least 20 characters (min 20)."),
  displayOrder: z.coerce.number({ invalid_type_error: "Display order must be numeric." }).int(),
  isActive: z.boolean().default(true),
});

const teacherUpdateSchema = teacherSchema.extend({
  id: z.string().min(1, "Teacher id is required."),
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

function revalidateTeacherPages() {
  revalidatePath("/teachers");
  revalidatePath("/admin/teachers");
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
  queryKey: "teacherMessage" | "teacherError",
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

type TeacherActionResult = {
  success: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

function extractPhoto(formData: FormData) {
  const candidate = formData.get("photo");
  if (!(candidate instanceof File) || candidate.size === 0) {
    return null;
  }
  return candidate;
}

function validatePhoto(photo: File | null) {
  if (!photo) {
    return null;
  }

  if (!ALLOWED_IMAGE_TYPES.has(photo.type)) {
    return ["Teacher photo must be a JPG, JPEG, PNG, or WEBP image."];
  }

  if (photo.size > MAX_IMAGE_BYTES) {
    return ["Teacher photo must be 5 MB or smaller."];
  }

  return null;
}

async function resolvePhotoUrl(
  formData: FormData,
  adminId: string,
): Promise<{ photoUrl?: string | null; errors?: string[] }> {
  const photo = extractPhoto(formData);
  const photoErrors = validatePhoto(photo);
  if (photoErrors) {
    return { errors: photoErrors };
  }

  if (photo) {
    const storage = createStorageService();
    const storageKey = await storage.upload(photo, {
      filename: photo.name,
      namespace: publicTeacherPhotoNamespace(adminId),
      contentType: photo.type,
    });
    return { photoUrl: storage.getURL(storageKey) };
  }

  if (formData.get("clearPhoto")?.toString() === "true") {
    return { photoUrl: null };
  }

  if (formData.has("photoUrl") && formData.get("photoUrl")?.toString() === "") {
    return { photoUrl: null };
  }

  return {};
}

function normalizeTeacherInput(formData: FormData) {
  return {
    fullName: formData.get("fullName")?.toString() ?? "",
    title: formData.get("title")?.toString() ?? "",
    bio: formData.get("bio")?.toString() ?? "",
    displayOrder: formData.get("displayOrder")?.toString() ?? "0",
    isActive: formData.get("isActive") === "true",
  };
}

function readTeacherLinks(formData: FormData) {
  return {
    subjects: formData
      .getAll("subjects")
      .map((subject) => subject.toString().trim())
      .filter((subject) => Boolean(subject)),
    cabinetUserId: formData.get("cabinetUserId")?.toString().trim() || null,
  };
}

function teacherAuditSnapshot(value: Record<string, unknown>) {
  const { role: _role, ...rest } = value;
  return rest;
}

function extractFormData(firstArg: TeacherActionState | FormData, secondArg?: FormData): FormData {
  return firstArg instanceof FormData ? firstArg : (secondArg ?? new FormData());
}

export async function createTeacherAction(
  prevStateOrFormData: TeacherActionState | FormData,
  maybeFormData?: FormData,
): Promise<TeacherActionState> {
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

    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to create teacher profile.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to create teacher profile.",
    };
  }

  const parsed = teacherSchema.safeParse(normalizeTeacherInput(formData));
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          flattenFieldErrors(errors) || "Please review the teacher form and try again.",
        ),
      );
    }
    return { success: false, errors };
  }

  const photoResult = await resolvePhotoUrl(formData, session.uid);
  if (photoResult.errors) {
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "teacherError", photoResult.errors.join(" ")));
    }
    return { success: false, errors: { photo: photoResult.errors } };
  }

  const { subjects, cabinetUserId } = readTeacherLinks(formData);

  try {
    if (!session) {
      throw new Error("Failed to create teacher profile.");
    }
    await prisma.$transaction(async (tx) => {
      const createdTeacher = await createTeacher(
        {
          ...parsed.data,
          subjects,
          cabinetUserId,
          ...(photoResult.photoUrl !== undefined ? { photoUrl: photoResult.photoUrl } : {}),
        },
        tx,
      );
      const teacherId = createdTeacher?.id;
      if (!teacherId) {
        throw new Error("Failed to create teacher profile.");
      }
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "TEACHER_PROFILE_CREATED",
          targetType: "teacher",
          targetId: teacherId,
          before: null,
          after: teacherAuditSnapshot({
            id: teacherId,
            ...parsed.data,
            subjects,
            cabinetUserId,
            ...(photoResult.photoUrl !== undefined ? { photoUrl: photoResult.photoUrl } : {}),
          }),
          meta: {
            actorRole: UserRole.ADMIN,
            teacherProfileId: teacherId,
          },
        },
        tx,
      );
    });
    revalidateTeacherPages();
  } catch (error) {
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to create teacher profile.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to create teacher profile.",
    };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "teacherMessage", "Teacher profile created."));
  }

  return { success: true, message: "Teacher profile created." };
}

export async function updateTeacherAction(
  prevStateOrFormData: TeacherActionState | FormData,
  maybeFormData?: FormData,
): Promise<TeacherActionState> {
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

    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to update teacher profile.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update teacher profile.",
    };
  }

  const parsed = teacherUpdateSchema.safeParse({
    id: formData.get("id")?.toString() ?? "",
    ...normalizeTeacherInput(formData),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          flattenFieldErrors(errors) || "Please review the teacher form and try again.",
        ),
      );
    }
    return { success: false, errors };
  }

  const photoResult = await resolvePhotoUrl(formData, session.uid);
  if (photoResult.errors) {
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "teacherError", photoResult.errors.join(" ")));
    }
    return { success: false, errors: { photo: photoResult.errors } };
  }

  const currentPhotoUrl = formData.get("photoUrl")?.toString().trim() || null;
  const { subjects, cabinetUserId } = readTeacherLinks(formData);

  try {
    if (!session) {
      throw new Error("Failed to update teacher profile.");
    }
    await prisma.$transaction(async (tx) => {
      const updatedTeacher = await updateTeacher(
        parsed.data.id,
        {
          fullName: parsed.data.fullName,
          title: parsed.data.title,
          bio: parsed.data.bio,
          displayOrder: parsed.data.displayOrder,
          isActive: parsed.data.isActive,
          subjects,
          cabinetUserId,
          ...(photoResult.photoUrl !== undefined ? { photoUrl: photoResult.photoUrl } : {}),
        },
        tx,
      );
      const resultWithAudit = updatedTeacher as {
        before?: Record<string, unknown> | null;
        after?: Record<string, unknown> | null;
      } | null;
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "TEACHER_PROFILE_UPDATED",
          targetType: "teacher",
          targetId: parsed.data.id,
          before: teacherAuditSnapshot(
            resultWithAudit?.before ?? {
              id: parsed.data.id,
              photoUrl: currentPhotoUrl,
            },
          ),
          after: teacherAuditSnapshot(
            resultWithAudit?.after ?? {
              ...parsed.data,
              subjects,
              cabinetUserId,
              ...(photoResult.photoUrl !== undefined ? { photoUrl: photoResult.photoUrl } : {}),
            },
          ),
          meta: {
            actorRole: UserRole.ADMIN,
            teacherProfileId: parsed.data.id,
          },
        },
        tx,
      );
    });

    if (
      currentPhotoUrl &&
      currentPhotoUrl !== photoResult.photoUrl &&
      currentPhotoUrl.startsWith("/uploads/")
    ) {
      const storage = createStorageService();
      try {
        await storage.delete(currentPhotoUrl);
      } catch {
        // Ignore local cleanup failures.
      }
    }

    revalidateTeacherPages();
  } catch (error) {
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to update teacher profile.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update teacher profile.",
    };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "teacherMessage", "Teacher profile updated."));
  }

  return { success: true, message: "Teacher profile updated." };
}

export async function toggleTeacherStatusAction(
  prevStateOrFormData: TeacherActionState | FormData,
  maybeFormData?: FormData,
): Promise<TeacherActionState> {
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

    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to update teacher status.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update teacher status.",
    };
  }

  const id = formData.get("id")?.toString() ?? "";
  const isActive = formData.get("isActive") === "true";
  if (!id) {
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "teacherError", "Teacher id is required."));
    }
    return { success: false, message: "Teacher id is required." };
  }

  try {
    if (!session) {
      throw new Error("Failed to update teacher status.");
    }
    await prisma.$transaction(async (tx) => {
      const updatedTeacher = await setTeacherActive(id, isActive, tx);
      const resultWithAudit = updatedTeacher as {
        before?: Record<string, unknown> | null;
        after?: Record<string, unknown> | null;
      };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "TEACHER_PROFILE_STATUS_UPDATED",
          targetType: "teacher",
          targetId: id,
          before: teacherAuditSnapshot(resultWithAudit.before ?? { id, isActive: !isActive }),
          after: teacherAuditSnapshot(resultWithAudit.after ?? { id, isActive }),
          meta: {
            actorRole: UserRole.ADMIN,
            teacherProfileId: id,
          },
        },
        tx,
      );
    });
    revalidateTeacherPages();
  } catch (error) {
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to update teacher status.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update teacher status.",
    };
  }

  if (flashMode && successRedirect) {
    redirect(
      buildRedirectUrl(
        successRedirect,
        "teacherMessage",
        isActive ? "Teacher profile activated." : "Teacher profile deactivated.",
      ),
    );
  }

  return {
    success: true,
    message: isActive ? "Teacher profile activated." : "Teacher profile deactivated.",
  };
}

export async function deleteTeacherAction(
  prevStateOrFormData: TeacherActionState | FormData,
  maybeFormData?: FormData,
): Promise<TeacherActionState> {
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

    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to delete teacher profile.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete teacher profile.",
    };
  }

  const id = formData.get("id")?.toString() ?? "";
  if (!id) {
    if (flashMode && errorRedirect) {
      redirect(buildRedirectUrl(errorRedirect, "teacherError", "Teacher id is required."));
    }
    return { success: false, message: "Teacher id is required." };
  }

  try {
    if (!session) {
      throw new Error("Failed to delete teacher profile.");
    }
    await prisma.$transaction(async (tx) => {
      const deletedTeacher = await deleteTeacher(id, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "TEACHER_PROFILE_DELETED",
          targetType: "teacher",
          targetId: id,
          before: deletedTeacher ?? { id },
          after: { deleted: true },
          meta: {
            actorRole: UserRole.ADMIN,
            teacherProfileId: id,
          },
        },
        tx,
      );
    });
    revalidateTeacherPages();
  } catch (error) {
    if (flashMode && errorRedirect) {
      redirect(
        buildRedirectUrl(
          errorRedirect,
          "teacherError",
          error instanceof Error ? error.message : "Failed to delete teacher profile.",
        ),
      );
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete teacher profile.",
    };
  }

  if (flashMode && successRedirect) {
    redirect(buildRedirectUrl(successRedirect, "teacherMessage", "Teacher profile deleted."));
  }

  return { success: true, message: "Teacher profile deleted." };
}
