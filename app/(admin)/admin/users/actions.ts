"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { createUser, toggleUserStatus, updateUserRole } from "@/lib/repositories/portal-repository";

function safeAppUserSnapshot(user: {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
  };
}

const createUserInputSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.nativeEnum(UserRole),
  phoneWhatsapp: z.string().trim().min(7).max(32).optional().or(z.literal("")),
});

const updateUserRoleInputSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.nativeEnum(UserRole),
});

const toggleUserStatusInputSchema = z.object({
  userId: z.string().trim().min(1),
  isActive: z.boolean(),
});

export async function createUserAction(input: unknown) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const parsed = createUserInputSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "Invalid input." };

    const data = await prisma.$transaction(async (tx) => {
      const created = await createUser(parsed.data, tx);
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "APP_USER_CREATED",
          targetType: "app_user",
          targetId: created.user.id,
          before: null,
          after: safeAppUserSnapshot(created.user),
          meta: {
            actorRole: UserRole.ADMIN,
            appUserId: created.user.id,
          },
        },
        tx,
      );
      return created;
    });
    revalidatePath("/admin/users");
    return {
      success: true as const,
      data: {
        user: safeAppUserSnapshot(data.user),
        temporaryPassword: data.temporaryPassword,
        mustChangePassword: data.mustChangePassword,
      },
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not create user.",
    };
  }
}

export async function updateUserRoleAction(input: unknown) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const parsed = updateUserRoleInputSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "Invalid input." };

    const data = await prisma.$transaction(async (tx) => {
      const updated = await updateUserRole(parsed.data.userId, parsed.data.role, session.uid, tx);
      const auditCandidate = updated as {
        role?: UserRole;
        before?: { role?: UserRole | string | null };
        after?: { role?: UserRole | string | null };
      };
      const before = auditCandidate.before ?? { role: null };
      const after = auditCandidate.after ?? { role: auditCandidate.role ?? parsed.data.role };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "APP_USER_ROLE_UPDATED",
          targetType: "app_user",
          targetId: parsed.data.userId,
          before,
          after,
          meta: {
            actorRole: UserRole.ADMIN,
            appUserId: parsed.data.userId,
          },
        },
        tx,
      );
      return updated;
    });
    revalidatePath("/admin/users");
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update role.",
    };
  }
}

export async function toggleUserStatusAction(input: unknown) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const parsed = toggleUserStatusInputSchema.safeParse(input);
    if (!parsed.success) return { success: false as const, error: "Invalid input." };

    const data = await prisma.$transaction(async (tx) => {
      const updated = await toggleUserStatus(
        parsed.data.userId,
        parsed.data.isActive,
        session.uid,
        tx,
      );
      const auditCandidate = updated as {
        isActive?: boolean;
        before?: { isActive?: boolean | null };
        after?: { isActive?: boolean | null };
      };
      const before = auditCandidate.before ?? { isActive: null };
      const after = auditCandidate.after ?? {
        isActive: auditCandidate.isActive ?? parsed.data.isActive,
      };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "APP_USER_STATUS_UPDATED",
          targetType: "app_user",
          targetId: parsed.data.userId,
          before,
          after,
          meta: {
            actorRole: UserRole.ADMIN,
            appUserId: parsed.data.userId,
          },
        },
        tx,
      );
      return updated;
    });
    revalidatePath("/admin/users");
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not update user status.",
    };
  }
}
