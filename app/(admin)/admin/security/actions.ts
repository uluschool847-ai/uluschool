"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import {
  generateBackupCodes,
  generateTwoFactorSecret,
  getTotpUri,
  verifyTotpCode,
} from "@/lib/auth/two-factor";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import {
  disableAdminTwoFactor,
  enableAdminTwoFactor,
  findAdminUserForTwoFactor,
  saveAdminTwoFactorSecret,
} from "@/lib/repositories/user-repository";

export type TwoFactorSetupState = {
  success: boolean;
  message: string;
  setupSecret?: string;
  otpAuthUrl?: string;
  backupCodes?: string[];
};

const setupCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a 6-digit authenticator code."),
});

export async function beginTwoFactorSetupAction(
  _prevState: TwoFactorSetupState,
): Promise<TwoFactorSetupState> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const admin = await findAdminUserForTwoFactor(session.uid);
    if (!admin) {
      return { success: false, message: "Admin user not found." };
    }

    if (admin.twoFactorEnabled) {
      return {
        success: false,
        message: "2FA is already enabled for this account.",
      };
    }

    const secret = generateTwoFactorSecret();
    await saveAdminTwoFactorSecret(admin.id, secret);

    return {
      success: true,
      message: "2FA secret generated. Add it in your authenticator app and confirm with code.",
      setupSecret: secret,
      otpAuthUrl: getTotpUri(admin.email, secret),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Could not start 2FA setup.",
    };
  }
}

export async function confirmTwoFactorSetupAction(
  _prevState: TwoFactorSetupState,
  formData: FormData,
): Promise<TwoFactorSetupState> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const admin = await findAdminUserForTwoFactor(session.uid);
    if (!admin || !admin.twoFactorSecret) {
      return {
        success: false,
        message: "2FA setup secret is missing. Start setup again.",
      };
    }

    const parsed = setupCodeSchema.safeParse({
      code: String(formData.get("code") || "").trim(),
    });

    if (!parsed.success) {
      return {
        success: false,
        message: "Please enter a valid 6-digit code.",
      };
    }

    const valid = verifyTotpCode(parsed.data.code, admin.twoFactorSecret);
    if (!valid) {
      return {
        success: false,
        message: "Invalid code. Make sure your authenticator app time is in sync.",
        setupSecret: admin.twoFactorSecret,
        otpAuthUrl: getTotpUri(admin.email, admin.twoFactorSecret),
      };
    }

    const backupCodes = await generateBackupCodes();
    await enableAdminTwoFactor(admin.id, admin.twoFactorSecret, backupCodes.hashed);

    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "ADMIN_2FA_ENABLED",
      targetType: "AppUser",
      targetId: admin.id,
      before: { twoFactorEnabled: false },
      after: { twoFactorEnabled: true },
      meta: { actorRole: UserRole.ADMIN },
    });

    revalidatePath("/admin/security");

    return {
      success: true,
      message:
        "2FA enabled. Save these backup codes in a safe place. Each code can be used only once.",
      backupCodes: backupCodes.plain,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Could not enable 2FA.",
    };
  }
}

export async function disableTwoFactorAction(): Promise<TwoFactorSetupState> {
  try {
    const session = await requireRole([UserRole.ADMIN]);
    const admin = await findAdminUserForTwoFactor(session.uid);
    if (!admin) {
      return { success: false, message: "Admin user not found." };
    }

    if (!admin.twoFactorEnabled) {
      return { success: false, message: "2FA is already disabled for this account." };
    }

    await disableAdminTwoFactor(admin.id);
    await createAdminAuditLog({
      adminUserId: session.uid,
      action: "ADMIN_2FA_DISABLED",
      targetType: "AppUser",
      targetId: admin.id,
      before: { twoFactorEnabled: true },
      after: { twoFactorEnabled: false },
      meta: { actorRole: UserRole.ADMIN },
    });

    revalidatePath("/admin/security");

    return {
      success: true,
      message: "2FA disabled for this admin account.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Could not disable 2FA.",
    };
  }
}
