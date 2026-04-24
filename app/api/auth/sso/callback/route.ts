import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth/session";
import { isSsoEnabled, verifySsoSignature } from "@/lib/auth/sso";
import { createAdminAuditLog } from "@/lib/repositories/admin-audit-repository";
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
    return NextResponse.json({ ok: false, error: "Admin user is not allowed for SSO" }, { status: 403 });
  }

  await createSession({
    uid: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
    mfaVerified: true,
    authMethod: "sso",
  });

  await createAdminAuditLog({
    adminUserId: user.id,
    action: "ADMIN_SSO_LOGIN",
    targetType: "Auth",
    targetId: user.id,
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
