"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { createUser, toggleUserStatus, updateUserRole } from "@/lib/repositories/portal-repository";

function safeAppUserSnapshot(user: {
  id: string;
  email?: string | null;
  fullName?: string | null;
  role?: UserRole | string | null;
  isActive?: boolean | null;
}) {
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: user.fullName ?? null,
    role: user.role ?? null,
    isActive: user.isActive ?? null,
  };
}

function parseRole(role: string): UserRole {
  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new Error("Invalid role");
  }

  return role as UserRole;
}

export async function createUserAction(input: {
  email: string;
  fullName: string;
  role: string;
  phoneWhatsapp?: string;
}) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const role = parseRole(input.role);
    const data = await prisma.$transaction(async (tx) => {
      const created = await createUser(
        {
          email: input.email,
          fullName: input.fullName,
          role,
          phoneWhatsapp: input.phoneWhatsapp,
        },
        tx,
      );
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
    return { success: true as const, data };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Could not create user.",
    };
  }
}

export async function updateUserRoleAction(input: { userId: string; role: string }) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const newRole = parseRole(input.role);
    const data = await prisma.$transaction(async (tx) => {
      const updated = await updateUserRole(input.userId, newRole, session.uid, tx);
      const auditCandidate = updated as {
        role?: UserRole;
        before?: { role?: UserRole | string | null };
        after?: { role?: UserRole | string | null };
      };
      const before = auditCandidate.before ?? { role: null };
      const after = auditCandidate.after ?? { role: auditCandidate.role ?? newRole };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "APP_USER_ROLE_UPDATED",
          targetType: "app_user",
          targetId: input.userId,
          before,
          after,
          meta: {
            actorRole: UserRole.ADMIN,
            appUserId: input.userId,
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

export async function toggleUserStatusAction(input: { userId: string; isActive: boolean }) {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const data = await prisma.$transaction(async (tx) => {
      const updated = await toggleUserStatus(input.userId, input.isActive, session.uid, tx);
      const auditCandidate = updated as {
        isActive?: boolean;
        before?: { isActive?: boolean | null };
        after?: { isActive?: boolean | null };
      };
      const before = auditCandidate.before ?? { isActive: null };
      const after = auditCandidate.after ?? { isActive: auditCandidate.isActive ?? input.isActive };
      await createAdminAuditLog(
        {
          adminUserId: session.uid,
          action: "APP_USER_STATUS_UPDATED",
          targetType: "app_user",
          targetId: input.userId,
          before,
          after,
          meta: {
            actorRole: UserRole.ADMIN,
            appUserId: input.userId,
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
