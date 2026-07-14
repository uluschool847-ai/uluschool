"use server";

import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

import {
  clearAdminPendingTwoFactor,
  clearInitialSetupSession,
  clearSession,
  createAdminPendingTwoFactor,
  createSession,
  getInitialSetupSession,
  getPortalRedirectPath,
} from "@/lib/auth/session";
import {
  InitialPasswordChangeError,
  changeInitialPassword,
} from "@/lib/repositories/account-setup-repository";
import {
  type InitialPasswordFormState,
  getSafeInitialPasswordFieldErrors,
  initialPasswordMessages,
  initialPasswordSchema,
} from "@/lib/validations/initial-password";

function getStringEntry(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function clearAllAuthCookies() {
  await clearSession();
  await clearAdminPendingTwoFactor();
  await clearInitialSetupSession();
}

export async function changeInitialPasswordAction(
  _previousState: InitialPasswordFormState,
  formData: FormData,
): Promise<InitialPasswordFormState> {
  if (!(formData instanceof FormData)) {
    return { success: false, message: initialPasswordMessages.invalidInput };
  }

  const parsed = initialPasswordSchema.safeParse({
    currentPassword: getStringEntry(formData, "currentPassword"),
    newPassword: getStringEntry(formData, "newPassword"),
    confirmPassword: getStringEntry(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: initialPasswordMessages.invalidInput,
      errors: getSafeInitialPasswordFieldErrors(parsed.error),
    };
  }

  const setup = await getInitialSetupSession();
  if (!setup) {
    return {
      success: false,
      message: initialPasswordMessages.setupExpired,
    };
  }

  let user: Awaited<ReturnType<typeof changeInitialPassword>>;
  try {
    user = await changeInitialPassword(
      setup.uid,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
  } catch (error) {
    if (error instanceof InitialPasswordChangeError) {
      const message = {
        INVALID_SETUP: initialPasswordMessages.setupInvalid,
        INVALID_CURRENT_PASSWORD: initialPasswordMessages.currentIncorrect,
        PASSWORD_REUSE: initialPasswordMessages.passwordReuse,
      }[error.code];

      return { success: false, message };
    }

    return {
      success: false,
      message: initialPasswordMessages.unexpected,
    };
  }

  if (user.id !== setup.uid || user.role !== setup.role) {
    return {
      success: false,
      message: initialPasswordMessages.setupInvalid,
    };
  }

  const requireAdminTwoFactor = (process.env.ADMIN_REQUIRE_2FA ?? "true") !== "false";
  if (user.role !== UserRole.ADMIN || !requireAdminTwoFactor) {
    await clearAllAuthCookies();
    await createSession({
      uid: user.id,
      role: user.role,
      email: user.email,
      fullName: user.fullName,
      mfaVerified: user.role !== UserRole.ADMIN,
      authMethod: "password",
    });
    redirect(getPortalRedirectPath(user.role, setup.nextPath));
  }

  if (user.twoFactorEnabled) {
    await clearAllAuthCookies();
    await createAdminPendingTwoFactor({ uid: user.id, email: user.email });
    redirect("/portal/login/verify-2fa");
  }

  await clearSession();
  await clearAdminPendingTwoFactor();
  redirect("/portal/setup/2fa");
}
