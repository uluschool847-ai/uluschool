"use server";

import { verifyPassword } from "@/lib/auth/password";
import {
  clearInitialSetupSession,
  clearSession,
  createInitialSetupSession,
  createSession,
  getPortalRedirectPath,
} from "@/lib/auth/session";
import { logAuthEvent } from "@/lib/repositories/admin-audit-repository";
import { findUserByEmail } from "@/lib/repositories/user-repository";
import {
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "@/lib/security/rate-limit";
import { type LoginFormState, loginSchema } from "@/lib/validations/auth";
import { redirect } from "next/navigation";

export async function loginAction(
  prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const nextValue = formData.get("next");
  const email = typeof emailValue === "string" ? emailValue : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const nextPath = typeof nextValue === "string" ? nextValue : undefined;
  const identifier = email.trim().toLowerCase();

  const parsed = loginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return {
      success: false,
      message: "Invalid input",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const rateLimit = checkLoginRateLimit(identifier);
  if (!rateLimit.allowed) {
    return {
      success: false,
      message: `Too many attempts. Try again in ${Math.max(1, Math.ceil((rateLimit.retryAfterSeconds ?? 0) / 60))} minutes.`,
      retryAfter: rateLimit.retryAfterSeconds,
    };
  }

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !user.isActive) {
    recordFailedLogin(identifier);
    const failedAttemptState = checkLoginRateLimit(identifier);
    await logAuthEvent({
      eventType: failedAttemptState.allowed ? "LOGIN_FAILED" : "ACCOUNT_LOCKED",
      identifier,
      timestamp: new Date(),
    });
    if (!failedAttemptState.allowed) {
      return {
        success: false,
        message: `Too many attempts. Try again in ${Math.max(1, Math.ceil((failedAttemptState.retryAfterSeconds ?? 0) / 60))} minutes.`,
        retryAfter: failedAttemptState.retryAfterSeconds,
      };
    }
    return {
      success: false,
      message: `Invalid email or password. ${failedAttemptState.remainingAttempts} attempts remaining.`,
    };
  }

  const isPasswordValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isPasswordValid) {
    recordFailedLogin(identifier);
    const failedAttemptState = checkLoginRateLimit(identifier);
    await logAuthEvent({
      eventType: failedAttemptState.allowed ? "LOGIN_FAILED" : "ACCOUNT_LOCKED",
      userId: user.id,
      identifier,
      timestamp: new Date(),
    });
    if (!failedAttemptState.allowed) {
      return {
        success: false,
        message: `Too many attempts. Try again in ${Math.max(1, Math.ceil((failedAttemptState.retryAfterSeconds ?? 0) / 60))} minutes.`,
        retryAfter: failedAttemptState.retryAfterSeconds,
      };
    }
    return {
      success: false,
      message: `Invalid email or password. ${failedAttemptState.remainingAttempts} attempts remaining.`,
    };
  }

  recordSuccessfulLogin(identifier);

  await clearSession();
  await clearInitialSetupSession();

  if (user.mustChangePassword) {
    await createInitialSetupSession({
      uid: user.id,
      email: user.email,
      role: user.role,
      ...(nextPath ? { nextPath } : {}),
    });
    redirect("/portal/setup/password");
  }

  await createSession({
    uid: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
    authMethod: "password",
  });
  await logAuthEvent({
    eventType: "LOGIN_SUCCESS",
    userId: user.id,
    identifier,
    metadata: { authenticationStage: "final", authMethod: "password" },
    timestamp: new Date(),
  });

  redirect(getPortalRedirectPath(user.role, nextPath));
}
