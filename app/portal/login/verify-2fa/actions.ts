"use server";

import {
  clearAdminPendingTwoFactor,
  createSession,
  getAdminPendingTwoFactor,
  getPortalRedirectPath,
} from "@/lib/auth/session";
import { consumeBackupCode, verifyTotpCode } from "@/lib/auth/two-factor";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  consumeAdminBackupCode,
  findAdminUserForTwoFactor,
} from "@/lib/repositories/user-repository";
import { type TwoFactorFormState, twoFactorVerifySchema } from "@/lib/validations/two-factor";
import { redirect } from "next/navigation";

export async function verify2faAction(
  prevState: TwoFactorFormState,
  formData: FormData,
): Promise<TwoFactorFormState> {
  const code = formData.get("code")?.toString() || "";
  const backupCode = formData.get("backupCode")?.toString() || "";
  const nextPath = formData.get("next") as string | null;

  const parsed = twoFactorVerifySchema.safeParse({ code, backupCode });
  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid input.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const pendingSession = await getAdminPendingTwoFactor();
  if (!pendingSession) {
    return { success: false, message: "Two-factor session expired. Please log in again." };
  }

  const user = await findAdminUserForTwoFactor(pendingSession.uid);
  if (!user || !user.twoFactorEnabled) {
    await clearAdminPendingTwoFactor();
    return { success: false, message: "Invalid state. Please log in again." };
  }

  const isUsingBackupCode = Boolean(parsed.data.backupCode);

  if (isUsingBackupCode) {
    const backupCodeValue = parsed.data.backupCode;
    if (!backupCodeValue) {
      return { success: false, message: "Backup code is required." };
    }

    const backupCodeResult = await consumeBackupCode({
      providedCode: backupCodeValue,
      hashedCodes: user.twoFactorBackupCodes,
    });
    const isValidBackup = backupCodeResult.valid;

    if (!isValidBackup) {
      await createAdminAuditLog({
        adminUserId: user.id,
        action: "ADMIN_LOGIN_2FA_BACKUP_FAILED",
        targetType: "AUTH",
        meta: {
          ipAddress: "127.0.0.1",
          userAgent: "unknown",
        },
      });
      return { success: false, message: "Invalid or already used backup code." };
    }

    await consumeAdminBackupCode(user.id, backupCodeResult.remaining);

    await createAdminAuditLog({
      adminUserId: user.id,
      action: "ADMIN_LOGIN_2FA_BACKUP_SUCCESS",
      targetType: "AUTH",
      meta: {
        ipAddress: "127.0.0.1",
        userAgent: "unknown",
      },
    });
  } else {
    // Standard TOTP
    if (!user.twoFactorSecret) {
      return { success: false, message: "2FA is not properly configured." };
    }

    const codeValue = parsed.data.code;
    if (!codeValue) {
      return { success: false, message: "Authenticator code is required." };
    }

    const isValidTotp = verifyTotpCode(codeValue, user.twoFactorSecret);
    if (!isValidTotp) {
      await createAdminAuditLog({
        adminUserId: user.id,
        action: "ADMIN_LOGIN_2FA_TOTP_FAILED",
        targetType: "AUTH",
        meta: {
          ipAddress: "127.0.0.1",
          userAgent: "unknown",
        },
      });
      return { success: false, message: "Invalid authenticator code." };
    }

    await createAdminAuditLog({
      adminUserId: user.id,
      action: "ADMIN_LOGIN_2FA_TOTP_SUCCESS",
      targetType: "AUTH",
      meta: {
        ipAddress: "127.0.0.1",
        userAgent: "unknown",
      },
    });
  }

  await clearAdminPendingTwoFactor();
  await createSession({
    uid: user.id,
    role: user.role,
    email: user.email,
    mfaVerified: true,
    authMethod: "password",
  });

  redirect(getPortalRedirectPath(user.role, nextPath));
}
