"use server";

import { verifyPassword } from "@/lib/auth/password";
import {
  clearAdminPendingTwoFactor,
  clearSession,
  createAdminPendingTwoFactor,
  createInitialSetupSession,
  createSession,
  getPortalRedirectPath,
} from "@/lib/auth/session";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { logAuthEvent } from "@/lib/repositories/admin-audit-repository";
import { findUserByEmail } from "@/lib/repositories/user-repository";
import {
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "@/lib/security/rate-limit";
import { type LoginFormState, loginSchema } from "@/lib/validations/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

export async function loginAction(
  prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const nextPath = formData.get("next") as string | null;
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
  await logAuthEvent({
    eventType: "LOGIN_SUCCESS",
    userId: user.id,
    identifier,
    timestamp: new Date(),
  });

  const require2FA = (process.env.ADMIN_REQUIRE_2FA ?? "true") !== "false";
  const adminNeedsEnrollment = user.role === UserRole.ADMIN && require2FA && !user.twoFactorEnabled;

  if (user.mustChangePassword || adminNeedsEnrollment) {
    await clearSession();
    await clearAdminPendingTwoFactor();
    await createInitialSetupSession({
      uid: user.id,
      email: user.email,
      role: user.role,
      ...(nextPath ? { nextPath } : {}),
    });
    redirect(user.mustChangePassword ? "/portal/setup/password" : "/portal/setup/2fa");
  }

  if (user.role === UserRole.ADMIN) {
    if (require2FA) {
      await createAdminAuditLog({
        adminUserId: user.id,
        action: "ADMIN_LOGIN_PENDING_2FA",
        targetType: "AUTH",
        meta: {
          ipAddress: "127.0.0.1",
          userAgent: "unknown",
        },
      });

      await createAdminPendingTwoFactor({ uid: user.id, email: user.email });

      const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
      redirect(`/portal/login/verify-2fa${nextQuery}`);
    }

    // 2FA Disabled
    await createAdminAuditLog({
      adminUserId: user.id,
      action: "ADMIN_LOGIN_PASSWORD_ONLY",
      targetType: "AUTH",
      meta: {
        ipAddress: "127.0.0.1",
        userAgent: "unknown",
      },
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
