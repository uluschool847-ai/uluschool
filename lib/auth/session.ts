import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "ulu_session";
const ADMIN_PENDING_2FA_COOKIE = "ulu_admin_2fa_pending";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const ADMIN_PENDING_2FA_DURATION_MS = 1000 * 60 * 10;

type AuthMethod = "password" | "sso";

export type SessionPayload = {
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  exp: number;
  mfaVerified: boolean;
  authMethod: AuthMethod;
};

type PendingTwoFactorPayload = {
  uid: string;
  email: string;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-auth-session-secret-please-change";
  }

  throw new Error("AUTH_SESSION_SECRET must be set and at least 16 characters.");
}

// Helper for Base64URL encoding/decoding without Node.js Buffer
function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(padLength));
}

async function signPayload(payloadBase64: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(getSessionSecret());
  const data = encoder.encode(payloadBase64);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureStr = signatureArray.map((b) => String.fromCharCode(b)).join("");
  return toBase64Url(signatureStr);
}

async function verifySignature(payloadBase64: string, signatureBase64: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(getSessionSecret());
  const data = encoder.encode(payloadBase64);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  // Decode signatureBase64 back to Uint8Array
  const signatureStr = fromBase64Url(signatureBase64);
  const signatureArray = new Uint8Array(signatureStr.split("").map((c) => c.charCodeAt(0)));

  return await crypto.subtle.verify("HMAC", key, signatureArray, data);
}

async function encodeSignedPayload(payload: object): Promise<string> {
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = await signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

async function decodeSignedPayload<T>(token: string): Promise<T | null> {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const isValid = await verifySignature(payloadBase64, signature);
  if (!isValid) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(payloadBase64)) as T;
  } catch {
    return null;
  }
}

function isNotExpired(exp: number | undefined) {
  return Boolean(exp && Date.now() <= exp);
}

const PORTAL_DASHBOARD_PATHS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "/admin",
  [UserRole.TEACHER]: "/portal/teacher",
  [UserRole.STUDENT]: "/portal/student",
  [UserRole.PARENT]: "/portal/parent",
};

function isSafePortalNextPath(nextPath: string, role: UserRole) {
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return false;
  }

  switch (role) {
    case UserRole.ADMIN:
      return nextPath.startsWith("/admin");
    case UserRole.TEACHER:
      return nextPath.startsWith("/portal/teacher");
    case UserRole.STUDENT:
      return nextPath.startsWith("/portal/student");
    case UserRole.PARENT:
      return nextPath.startsWith("/portal/parent");
    default:
      return false;
  }
}

export function getPortalDashboardPath(role: UserRole) {
  return PORTAL_DASHBOARD_PATHS[role];
}

export function getPortalLoginPath(nextPath?: string | null) {
  const normalized = nextPath?.trim();
  if (normalized?.startsWith("/") && !normalized.startsWith("//")) {
    return `/portal/login?next=${encodeURIComponent(normalized)}`;
  }

  return "/portal/login";
}

export function getPortalRedirectPath(role: UserRole, nextPath?: string | null) {
  const normalized = nextPath?.trim();
  if (normalized && isSafePortalNextPath(normalized, role)) {
    return normalized;
  }

  return getPortalDashboardPath(role);
}

export async function createSession(input: {
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  mfaVerified?: boolean;
  authMethod?: AuthMethod;
}) {
  const payload: SessionPayload = {
    uid: input.uid,
    role: input.role,
    email: input.email,
    fullName: input.fullName ?? null,
    exp: Date.now() + SESSION_DURATION_MS,
    mfaVerified: input.mfaVerified ?? true,
    authMethod: input.authMethod ?? "password",
  };

  const token = await encodeSignedPayload(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = await decodeSignedPayload<SessionPayload>(token);
  if (!payload || !isNotExpired(payload.exp)) {
    return null;
  }
  return payload;
}

/**
 * Lightweight session verification for use in Middleware (Edge Runtime).
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const payload = await decodeSignedPayload<SessionPayload>(token);
  if (!payload || !isNotExpired(payload.exp)) {
    return null;
  }
  return payload;
}

export async function createAdminPendingTwoFactor(input: { uid: string; email: string }) {
  const payload: PendingTwoFactorPayload = {
    uid: input.uid,
    email: input.email,
    exp: Date.now() + ADMIN_PENDING_2FA_DURATION_MS,
  };

  const token = await encodeSignedPayload(payload);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_PENDING_2FA_DURATION_MS / 1000,
  });
}

export async function getAdminPendingTwoFactor(): Promise<PendingTwoFactorPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_PENDING_2FA_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = await decodeSignedPayload<PendingTwoFactorPayload>(token);
  if (!payload || !isNotExpired(payload.exp)) {
    return null;
  }
  return payload;
}

export async function clearAdminPendingTwoFactor() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_PENDING_2FA_COOKIE);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect("/portal/login");
  }
  return session;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const session = await requireSession();
  if (!allowedRoles.includes(session.role)) {
    redirect(getPortalDashboardPath(session.role));
  }

  if (
    session.role === UserRole.ADMIN &&
    process.env.ADMIN_REQUIRE_2FA !== "false" &&
    session.authMethod !== "sso" &&
    !session.mfaVerified
  ) {
    redirect("/portal/login/verify-2fa");
  }

  return session;
}
