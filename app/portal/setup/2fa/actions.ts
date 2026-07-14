"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import {
  clearAdminPendingTwoFactor,
  clearInitialSetupSession,
  clearSession,
  createSession,
  getInitialSetupSession,
  getPortalRedirectPath,
} from "@/lib/auth/session";
import {
  generateBackupCodes,
  generateTwoFactorSecret,
  getTotpUri,
  verifyTotpCode,
} from "@/lib/auth/two-factor";
import {
  InitialAdminTwoFactorEnrollmentError,
  beginInitialAdminTwoFactorEnrollment,
  confirmInitialAdminTwoFactorEnrollment,
  getInitialAdminTwoFactorEnrollment,
} from "@/lib/repositories/account-setup-repository";

type IdleState = {
  phase: "idle";
  success: false;
  message: "";
};

type ErrorState = {
  phase: "error";
  success: false;
  message: string;
};

type SetupState = {
  phase: "setup";
  success: true;
  message: string;
  setupSecret: string;
  otpAuthUrl: string;
};

type CompleteState = {
  phase: "complete";
  success: true;
  message: string;
  backupCodes: string[];
  continueHref: string;
};

export type InitialTwoFactorActionState = IdleState | ErrorState | SetupState | CompleteState;

const confirmationSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const messages = {
  invalidInput: "Invalid input.",
  invalidCodeInput: "Enter a 6-digit authenticator code.",
  setupExpired: "Your setup session has expired. Please sign in again.",
  setupInvalid: "Your setup session is no longer valid. Please sign in again.",
  alreadyEnabled: "Two-factor authentication is already enabled.",
  setupChanged: "Your two-factor setup changed. Start setup again.",
  invalidTotp: "Invalid authenticator code. Check the device time and try again.",
  beginFailed: "Unable to start two-factor setup. Please try again.",
  confirmFailed: "Unable to enable two-factor authentication. Please try again.",
} as const;

function errorState(message: string): ErrorState {
  return { phase: "error", success: false, message };
}

function getSetupIdentity(setup: {
  uid: string;
  email: string;
  role: UserRole;
}) {
  return {
    userId: setup.uid,
    email: setup.email,
    role: setup.role,
  };
}

function mapEnrollmentError(error: unknown, fallback: string): ErrorState {
  if (!(error instanceof InitialAdminTwoFactorEnrollmentError)) {
    return errorState(fallback);
  }

  const message = {
    ALREADY_ENABLED: messages.alreadyEnabled,
    SECRET_CHANGED: messages.setupChanged,
    INVALID_SETUP: messages.setupInvalid,
    INVALID_BACKUP_CODES: messages.confirmFailed,
  }[error.code];

  return errorState(message);
}

function hasEightUniqueStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    value.every((item) => typeof item === "string" && item.length > 0) &&
    new Set(value).size === value.length
  );
}

async function clearAllAuthCookies() {
  await clearSession();
  await clearAdminPendingTwoFactor();
  await clearInitialSetupSession();
}

export async function beginInitialTwoFactorSetupAction(
  _previousState: InitialTwoFactorActionState,
  formData: FormData,
): Promise<InitialTwoFactorActionState> {
  if (!(formData instanceof FormData)) {
    return errorState(messages.invalidInput);
  }

  try {
    const setup = await getInitialSetupSession();
    if (!setup) {
      return errorState(messages.setupExpired);
    }

    if (setup.role !== UserRole.ADMIN) {
      return errorState(messages.setupInvalid);
    }

    const secret = generateTwoFactorSecret();
    const admin = await beginInitialAdminTwoFactorEnrollment({
      ...getSetupIdentity(setup),
      secret,
    });

    if (
      admin.id !== setup.uid ||
      admin.email !== setup.email ||
      admin.role !== setup.role ||
      admin.twoFactorEnabled ||
      admin.twoFactorSecret !== secret
    ) {
      return errorState(messages.setupInvalid);
    }

    return {
      phase: "setup",
      success: true,
      message: "Add this account to your authenticator app, then confirm the code.",
      setupSecret: secret,
      otpAuthUrl: getTotpUri(admin.email, secret),
    };
  } catch (error) {
    return mapEnrollmentError(error, messages.beginFailed);
  }
}

export async function confirmInitialTwoFactorSetupAction(
  _previousState: InitialTwoFactorActionState,
  formData: FormData,
): Promise<InitialTwoFactorActionState> {
  if (!(formData instanceof FormData)) {
    return errorState(messages.invalidInput);
  }

  const codeEntry = formData.get("code");
  if (typeof codeEntry !== "string") {
    return errorState(messages.invalidCodeInput);
  }

  const parsed = confirmationSchema.safeParse({ code: codeEntry });
  if (!parsed.success) {
    return errorState(messages.invalidCodeInput);
  }

  try {
    const setup = await getInitialSetupSession();
    if (!setup) {
      return errorState(messages.setupExpired);
    }

    if (setup.role !== UserRole.ADMIN) {
      return errorState(messages.setupInvalid);
    }

    const identity = getSetupIdentity(setup);
    const currentAdmin = await getInitialAdminTwoFactorEnrollment(identity);
    if (
      currentAdmin.id !== setup.uid ||
      currentAdmin.email !== setup.email ||
      currentAdmin.role !== UserRole.ADMIN ||
      !currentAdmin.twoFactorSecret
    ) {
      return errorState(messages.setupInvalid);
    }

    if (!verifyTotpCode(parsed.data.code, currentAdmin.twoFactorSecret)) {
      return errorState(messages.invalidTotp);
    }

    const backupCodes = await generateBackupCodes();
    if (!hasEightUniqueStrings(backupCodes.plain) || !hasEightUniqueStrings(backupCodes.hashed)) {
      return errorState(messages.confirmFailed);
    }

    const admin = await confirmInitialAdminTwoFactorEnrollment({
      ...identity,
      expectedSecret: currentAdmin.twoFactorSecret,
      backupCodeHashes: backupCodes.hashed,
    });

    if (
      admin.id !== setup.uid ||
      admin.email !== setup.email ||
      admin.role !== UserRole.ADMIN ||
      !admin.twoFactorEnabled
    ) {
      return errorState(messages.setupInvalid);
    }

    const continueHref = getPortalRedirectPath(UserRole.ADMIN, setup.nextPath);
    await clearAllAuthCookies();
    await createSession({
      uid: admin.id,
      role: UserRole.ADMIN,
      email: admin.email,
      fullName: admin.fullName,
      mfaVerified: true,
      authMethod: "password",
    });

    return {
      phase: "complete",
      success: true,
      message: "Two-factor authentication is enabled. Save these backup codes now.",
      backupCodes: backupCodes.plain,
      continueHref,
    };
  } catch (error) {
    return mapEnrollmentError(error, messages.confirmFailed);
  }
}
