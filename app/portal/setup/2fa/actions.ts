"use server";

import { UserRole } from "@prisma/client";
import { z } from "zod";

import {
  type PreparedSessionCookie,
  createInitialTwoFactorSetupCapability,
  getInitialSetupSession,
  getInitialTwoFactorSecretFingerprint,
  getPortalRedirectPath,
  prepareSessionCookie,
  readInitialTwoFactorSetupCapability,
  replaceAuthCookieFamilyWithSession,
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
  getInitialAdminTwoFactorHandoff,
  recoverInitialAdminTwoFactorHandoff,
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

type RestartRequiredState = {
  phase: "restart-required";
  success: false;
  message: string;
};

type SetupState = {
  phase: "setup";
  success: true;
  message: string;
  setupSecret: string;
  otpAuthUrl: string;
  setupCapability: string;
};

type HandoffRequiredState = {
  phase: "handoff-required";
  success: true;
  message: string;
};

type CompleteState = {
  phase: "complete";
  success: true;
  message: string;
  backupCodes: string[];
  continueHref: string;
};

export type InitialTwoFactorActionState =
  | IdleState
  | ErrorState
  | RestartRequiredState
  | SetupState
  | HandoffRequiredState
  | CompleteState;

const confirmationSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  setupCapability: z.string().min(1).max(1024),
});

const messages = {
  invalidInput: "Invalid input.",
  invalidCodeInput: "Enter a 6-digit authenticator code.",
  setupExpired: "Your setup session has expired. Please sign in again.",
  setupInvalid: "Your setup session is no longer valid. Please sign in again.",
  setupChanged: "Your two-factor setup changed. Start setup again.",
  invalidTotp: "Invalid authenticator code. Check the device time and try again.",
  beginFailed: "Unable to start two-factor setup. Please try again.",
  confirmFailed: "Unable to enable two-factor authentication. Please try again.",
  recoverFailed: "Unable to complete secure sign-in. Please try again.",
  handoffRequired:
    "Two-factor authentication is enabled, but secure sign-in and backup-code delivery still need to be completed.",
} as const;

function errorState(message: string): ErrorState {
  return { phase: "error", success: false, message };
}

function restartRequiredState(): RestartRequiredState {
  return { phase: "restart-required", success: false, message: messages.setupChanged };
}

function handoffRequiredState(): HandoffRequiredState {
  return { phase: "handoff-required", success: true, message: messages.handoffRequired };
}

function getSetupIdentity(setup: { uid: string; email: string; role: UserRole }) {
  return { userId: setup.uid, email: setup.email, role: setup.role };
}

function mapEnrollmentError(
  error: unknown,
  fallback: string,
): ErrorState | RestartRequiredState | HandoffRequiredState {
  if (!(error instanceof InitialAdminTwoFactorEnrollmentError)) {
    return errorState(fallback);
  }

  if (error.code === "SECRET_CHANGED") {
    return restartRequiredState();
  }
  if (error.code === "ALREADY_ENABLED") {
    return handoffRequiredState();
  }

  const message = {
    INVALID_SETUP: messages.setupInvalid,
    INVALID_BACKUP_CODES: fallback,
  }[error.code];
  return errorState(message ?? fallback);
}

function hasEightUniqueStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === 8 &&
    value.every((item) => typeof item === "string" && item.length > 0) &&
    new Set(value).size === value.length
  );
}

async function finishHandoff(input: {
  preparedSession: PreparedSessionCookie;
  backupCodes: string[];
  continueHref: string;
}): Promise<CompleteState | HandoffRequiredState> {
  try {
    await replaceAuthCookieFamilyWithSession(input.preparedSession);
  } catch {
    return handoffRequiredState();
  }

  return {
    phase: "complete",
    success: true,
    message: "Two-factor authentication is enabled. Save these backup codes now.",
    backupCodes: input.backupCodes,
    continueHref: input.continueHref,
  };
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
    if (!setup) return errorState(messages.setupExpired);
    if (setup.role !== UserRole.ADMIN) return errorState(messages.setupInvalid);

    const secret = generateTwoFactorSecret();
    const [setupCapability, otpAuthUrl] = await Promise.all([
      createInitialTwoFactorSetupCapability({ uid: setup.uid, secret }),
      Promise.resolve(getTotpUri(setup.email, secret)),
    ]);
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
      otpAuthUrl,
      setupCapability,
    };
  } catch (error) {
    return mapEnrollmentError(error, messages.beginFailed);
  }
}

export async function confirmInitialTwoFactorSetupAction(
  _previousState: InitialTwoFactorActionState,
  formData: FormData,
): Promise<InitialTwoFactorActionState> {
  if (!(formData instanceof FormData)) return errorState(messages.invalidInput);

  const codeEntry = formData.get("code");
  if (typeof codeEntry !== "string" || !/^\d{6}$/.test(codeEntry)) {
    return errorState(messages.invalidCodeInput);
  }
  const capabilityEntry = formData.get("setupCapability");
  const parsed = confirmationSchema.safeParse({
    code: codeEntry,
    setupCapability: capabilityEntry,
  });
  if (!parsed.success) return restartRequiredState();

  try {
    const setup = await getInitialSetupSession();
    if (!setup) return errorState(messages.setupExpired);
    if (setup.role !== UserRole.ADMIN) return errorState(messages.setupInvalid);

    const capability = await readInitialTwoFactorSetupCapability(parsed.data.setupCapability);
    if (!capability || capability.uid !== setup.uid) return restartRequiredState();

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

    const currentFingerprint = await getInitialTwoFactorSecretFingerprint(
      currentAdmin.twoFactorSecret,
    );
    if (currentFingerprint !== capability.secretFingerprint) return restartRequiredState();
    if (!verifyTotpCode(parsed.data.code, currentAdmin.twoFactorSecret)) {
      return errorState(messages.invalidTotp);
    }

    const backupCodes = await generateBackupCodes();
    if (!hasEightUniqueStrings(backupCodes.plain) || !hasEightUniqueStrings(backupCodes.hashed)) {
      return errorState(messages.confirmFailed);
    }

    const continueHref = getPortalRedirectPath(UserRole.ADMIN, setup.nextPath);
    const preparedSession = await prepareSessionCookie({
      uid: currentAdmin.id,
      role: UserRole.ADMIN,
      email: currentAdmin.email,
      fullName: currentAdmin.fullName,
      mfaVerified: true,
      authMethod: "password",
    });
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
      return handoffRequiredState();
    }

    return finishHandoff({
      preparedSession,
      backupCodes: backupCodes.plain,
      continueHref,
    });
  } catch (error) {
    return mapEnrollmentError(error, messages.confirmFailed);
  }
}

export async function recoverInitialTwoFactorHandoffAction(
  _previousState: InitialTwoFactorActionState,
  formData: FormData,
): Promise<InitialTwoFactorActionState> {
  if (!(formData instanceof FormData)) return errorState(messages.invalidInput);

  try {
    const setup = await getInitialSetupSession();
    if (!setup) return errorState(messages.setupExpired);
    if (setup.role !== UserRole.ADMIN) return errorState(messages.setupInvalid);

    const identity = getSetupIdentity(setup);
    const currentAdmin = await getInitialAdminTwoFactorHandoff(identity);
    const backupCodes = await generateBackupCodes();
    if (!hasEightUniqueStrings(backupCodes.plain) || !hasEightUniqueStrings(backupCodes.hashed)) {
      return errorState(messages.recoverFailed);
    }

    const continueHref = getPortalRedirectPath(UserRole.ADMIN, setup.nextPath);
    const preparedSession = await prepareSessionCookie({
      uid: currentAdmin.id,
      role: UserRole.ADMIN,
      email: currentAdmin.email,
      fullName: currentAdmin.fullName,
      mfaVerified: true,
      authMethod: "password",
    });
    const admin = await recoverInitialAdminTwoFactorHandoff({
      ...identity,
      backupCodeHashes: backupCodes.hashed,
    });
    if (
      admin.id !== setup.uid ||
      admin.email !== setup.email ||
      admin.role !== UserRole.ADMIN ||
      !admin.twoFactorEnabled
    ) {
      return handoffRequiredState();
    }

    return finishHandoff({
      preparedSession,
      backupCodes: backupCodes.plain,
      continueHref,
    });
  } catch (error) {
    return mapEnrollmentError(error, messages.recoverFailed);
  }
}
