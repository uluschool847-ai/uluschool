"use server";

import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  createAdminPendingTwoFactor,
  getPortalRedirectPath,
} from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/repositories/user-repository";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { UserRole } from "@prisma/client";
import { loginSchema, type LoginFormState } from "@/lib/validations/auth";

export async function loginAction(
  prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const nextPath = formData.get("next") as string | null;

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid input",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !user.isActive) {
    return { success: false, message: "Invalid email or password." };
  }

  const isPasswordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isPasswordValid) {
    return { success: false, message: "Invalid email or password." };
  }

  if (user.role === UserRole.ADMIN) {
    const require2FA = process.env.ADMIN_REQUIRE_2FA !== "false";
    if (require2FA) {
      if (process.env.NODE_ENV !== "production") {
        await createAdminAuditLog({
          adminId: user.id,
          action: "ADMIN_LOGIN_2FA_REQUIRED_DEV_BYPASS",
          ipAddress: "127.0.0.1",
          userAgent: "dev-bypass",
          details: { note: "Bypassed 2FA UI for dev." },
        });

        await createSession({
          uid: user.id,
          role: user.role,
          email: user.email,
          fullName: user.fullName,
          mfaVerified: true,
          authMethod: "password",
        });

        const nextQuery = nextPath ? `&next=${encodeURIComponent(nextPath)}` : "";
        redirect(`/admin/security?setup2fa=required${nextQuery}`);
      }

      await createAdminAuditLog({
        adminId: user.id,
        action: "ADMIN_LOGIN_PENDING_2FA",
        ipAddress: "127.0.0.1",
        userAgent: "unknown",
      });

      await createAdminPendingTwoFactor({ uid: user.id, email: user.email });

      const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
      redirect(`/portal/login/verify-2fa${nextQuery}`);
    }

    // 2FA Disabled
    await createAdminAuditLog({
      adminId: user.id,
      action: "ADMIN_LOGIN_PASSWORD_ONLY",
      ipAddress: "127.0.0.1",
      userAgent: "unknown",
    });

    await createSession({
      uid: user.id,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      mfaVerified: false,
      authMethod: "password",
    });

    redirect(getPortalRedirectPath(user.role, nextPath));
  }

  // Non-Admin Login
  await createSession({
    uid: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
    mfaVerified: true,
    authMethod: "password",
  });

  redirect(getPortalRedirectPath(user.role, nextPath));
}
