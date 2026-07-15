import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { createAdminPendingTwoFactor } from "@/lib/auth/session";
import { isSsoEnabled, verifySsoSignature } from "@/lib/auth/sso";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
import { startAdminTwoFactorChallenge } from "@/lib/repositories/admin-two-factor-challenge-repository";
import { findUserByEmail } from "@/lib/repositories/user-repository";

const MAX_SSO_AGE_MS = 1000 * 60 * 3;

export async function GET(request: Request) {
  if (!isSsoEnabled()) {
    return NextResponse.json({ ok: false, error: "SSO disabled" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  const ts = (searchParams.get("ts") || "").trim();
  const sig = (searchParams.get("sig") || "").trim();

  if (!email || !ts || !sig) {
    return NextResponse.json({ ok: false, error: "Missing SSO parameters" }, { status: 400 });
  }

  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber) || Math.abs(Date.now() - tsNumber) > MAX_SSO_AGE_MS) {
    return NextResponse.json({ ok: false, error: "Expired SSO request" }, { status: 401 });
  }

  const validSig = verifySsoSignature({
    email,
    timestamp: ts,
    signature: sig,
  });
  if (!validSig) {
    return NextResponse.json({ ok: false, error: "Invalid SSO signature" }, { status: 401 });
  }

  const user = await findUserByEmail(email);
  if (!user || !user.isActive || user.role !== UserRole.ADMIN) {
    return NextResponse.json(
      { ok: false, error: "Admin user is not allowed for SSO" },
      { status: 403 },
    );
  }

  if (user.mustChangePassword || !user.twoFactorEnabled) {
    return NextResponse.json(
      { ok: false, error: "Admin user must complete local password and two-factor setup" },
      { status: 403 },
    );
  }

  const challenge = await startAdminTwoFactorChallenge({
    userId: user.id,
    authMethod: "sso",
  });
  await createAdminPendingTwoFactor({
    uid: user.id,
    email: user.email,
    challengeId: challenge.id,
    authMethod: "sso",
    expiresAt: challenge.expiresAt,
  });

  await createAdminAuditLog({
    adminUserId: user.id,
    action: "ADMIN_SSO_LOGIN_PENDING_2FA",
    targetType: "Auth",
    targetId: user.id,
    meta: { authenticationStage: "pending_two_factor", authMethod: "sso" },
  });

  return NextResponse.redirect(new URL("/portal/login/verify-2fa", request.url));
}
