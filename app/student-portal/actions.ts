"use server";

import { redirect } from "next/navigation";

import { verifyTotpCode, consumeBackupCode } from "@/lib/auth/two-factor";
import {
  clearAdminPendingTwoFactor,
  createAdminPendingTwoFactor,
  createSession,
  getAdminPendingTwoFactor,
  getSession,
  clearSession,
} from "@/lib/auth/session";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { verifyPassword } from "@/lib/auth/password";
import {
  consumeAdminBackupCode,
  findAdminUserForTwoFactor,
  findUserByEmail,
} from "@/lib/repositories/user-repository";
import { type LoginFormState, loginSchema } from "@/lib/validations/auth";
import { type TwoFactorFormState, twoFactorVerifySchema } from "@/lib/validations/two-factor";

export async function loginPortal(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const rawInput = {
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
  };

  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      message: "Please check your credentials and try again.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !user.isActive) {
    return {
      success: false,
      message: "Invalid email or password.",
    };
  }

  const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!validPassword) {
    return {
      success: false,
      message: "Invalid email or password.",
    };
  }

  if (user.role === "ADMIN") {
    const adminRequiresTwoFactor = process.env.ADMIN_REQUIRE_2FA !== "false";

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      await createAdminPendingTwoFactor({
        uid: user.id,
        email: user.email,
      });
      await createAdminAuditLog({
        adminUserId: user.id,
        action: "ADMIN_LOGIN_PASSWORD_OK_2FA_REQUIRED",
        targetType: "Auth",
        targetId: user.id,
      });
      redirect("/student-portal/verify-2fa");
    }

    if (adminRequiresTwoFactor) {
      if (process.env.NODE_ENV === "production") {
        return {
          success: false,
          message:
            "Admin 2FA is required before access. Configure 2FA for this admin or use SSO login.",
        };
      }

      await createSession({
        uid: user.id,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        mfaVerified: true,
        authMethod: "password",
      });
      await createAdminAuditLog({
        adminUserId: user.id,
        action: "ADMIN_LOGIN_2FA_REQUIRED_DEV_BYPASS",
        targetType: "Auth",
        targetId: user.id,
        meta: {
          warning: "ADMIN_REQUIRE_2FA bypassed in non-production",
        },
      });
      redirect("/admin/security?setup2fa=required");
    }
  }

  await createSession({
    uid: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
    mfaVerified: true,
    authMethod: "password",
  });

  if (user.role === "ADMIN") {
    await createAdminAuditLog({
      adminUserId: user.id,
      action: "ADMIN_LOGIN_PASSWORD_ONLY",
      targetType: "Auth",
      targetId: user.id,
      meta: {
        warning: "ADMIN_REQUIRE_2FA is disabled",
      },
    });
  }

  redirect(user.role === "ADMIN" ? "/admin" : "/portal");
}

export async function verifyAdminTwoFactor(
  _prevState: TwoFactorFormState,
  formData: FormData,
): Promise<TwoFactorFormState> {
  const pending = await getAdminPendingTwoFactor();
  if (!pending) {
    return {
      success: false,
      message: "2FA session expired. Please sign in again.",
    };
  }

  const parsed = twoFactorVerifySchema.safeParse({
    code: String(formData.get("code") || "").trim(),
    backupCode: String(formData.get("backupCode") || "").trim().toUpperCase(),
  });

  if (!parsed.success) {
    await createAdminAuditLog({
      adminUserId: pending.uid,
      action: "ADMIN_2FA_FAILED_INVALID_INPUT",
      targetType: "Auth",
      targetId: pending.uid,
    });
    return {
      success: false,
      message: "Please enter a valid authenticator code or backup code.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await findAdminUserForTwoFactor(pending.uid);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return {
      success: false,
      message: "Admin 2FA is not configured for this account.",
    };
  }

  const code = parsed.data.code?.trim();
  const backupCode = parsed.data.backupCode?.trim().toUpperCase();

  let verified = false;
  let usedBackupCode = false;

  if (code) {
    verified = verifyTotpCode(code, user.twoFactorSecret);
  }

  if (!verified && backupCode) {
    const backup = await consumeBackupCode({
      providedCode: backupCode,
      hashedCodes: user.twoFactorBackupCodes,
    });

    if (backup.valid) {
      verified = true;
      usedBackupCode = true;
      await consumeAdminBackupCode(user.id, backup.remaining);
    }
  }

  if (!verified) {
    await createAdminAuditLog({
      adminUserId: user.id,
      action: "ADMIN_2FA_FAILED_INVALID_CODE",
      targetType: "Auth",
      targetId: user.id,
    });
    return {
      success: false,
      message: "Invalid 2FA code. Please try again.",
    };
  }

  await clearAdminPendingTwoFactor();
  await createSession({
    uid: user.id,
    role: "ADMIN",
    email: user.email,
    fullName: user.fullName,
    mfaVerified: true,
    authMethod: "password",
  });

  await createAdminAuditLog({
    adminUserId: user.id,
    action: usedBackupCode ? "ADMIN_2FA_BACKUP_CODE_USED" : "ADMIN_2FA_VERIFIED",
    targetType: "Auth",
    targetId: user.id,
  });

  redirect("/admin");
}

export async function logoutPortal() {
  const session = await getSession();
  if (session?.role === "ADMIN") {
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "ADMIN_LOGOUT",
      targetType: "Auth",
      targetId: session.uid,
    });
  }
  await clearSession();
  await clearAdminPendingTwoFactor();
  redirect("/student-portal");
}

export async function getPortalSession() {
  return getSession();
}
