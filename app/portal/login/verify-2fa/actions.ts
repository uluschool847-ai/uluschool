"use server";

import {
  clearAdminPendingTwoFactor,
  createSession,
  getAdminPendingTwoFactor,
  getPortalRedirectPath,
} from "@/lib/auth/session";
import { completeAdminTwoFactorChallenge } from "@/lib/repositories/admin-two-factor-challenge-repository";
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

  const isUsingBackupCode = Boolean(parsed.data.backupCode);

  const codeValue = isUsingBackupCode ? parsed.data.backupCode : parsed.data.code;
  if (!codeValue) {
    return {
      success: false,
      message: isUsingBackupCode ? "Backup code is required." : "Authenticator code is required.",
    };
  }

  const completion = await completeAdminTwoFactorChallenge({
    userId: pendingSession.uid,
    challengeId: pendingSession.challengeId,
    authMethod: pendingSession.authMethod,
    verification: isUsingBackupCode
      ? { type: "backup", code: codeValue }
      : { type: "totp", code: codeValue },
  });

  if (completion.outcome === "rejected") {
    await clearAdminPendingTwoFactor();
    return { success: false, message: "Two-factor session expired. Please log in again." };
  }

  if (completion.outcome === "failure") {
    if (completion.locked) {
      await clearAdminPendingTwoFactor();
      return {
        success: false,
        message: "Too many invalid two-factor attempts. Please log in again.",
      };
    }
    return {
      success: false,
      message: isUsingBackupCode
        ? "Invalid or already used backup code."
        : "Invalid authenticator code.",
    };
  }

  await clearAdminPendingTwoFactor();
  await createSession({
    uid: completion.user.id,
    role: completion.user.role,
    email: completion.user.email,
    fullName: completion.user.fullName,
    mfaVerified: true,
    authMethod: pendingSession.authMethod,
  });

  redirect(getPortalRedirectPath(completion.user.role, nextPath));
}
