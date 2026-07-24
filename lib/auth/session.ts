import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { findUserById } from "@/lib/repositories/user-repository";

const SESSION_COOKIE = "ulu_session";
const LEGACY_ADMIN_PENDING_2FA_COOKIE = "ulu_admin_2fa_pending";
const INITIAL_SETUP_COOKIE = "ulu_initial_setup";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_SECURITY_VERSION = 3 as const;
const INITIAL_SETUP_DURATION_MS = 1000 * 60 * 15;
const MAX_INITIAL_SETUP_NEXT_PATH_LENGTH = 2048;
const RETIRED_ADMIN_SECURITY_PATH = "/admin/security";

export type AuthMethod = "password" | "sso";

type SessionInput = {
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  authMethod?: AuthMethod;
};

export type PreparedSessionCookie = {
  name: typeof SESSION_COOKIE;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: "/";
    maxAge: number;
  };
};

export type SessionPayload = {
  purpose: "SESSION";
  version: typeof SESSION_SECURITY_VERSION;
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  exp: number;
  authMethod: AuthMethod;
};

export type InitialSetupPayload = {
  uid: string;
  email: string;
  role: UserRole;
  nextPath?: string;
  purpose: "INITIAL_SETUP";
  exp: number;
};

export type SessionValidationResult = {
  valid: boolean;
  expired: boolean;
  reason?: string;
  user?: { id: string; role: string };
};

type SessionReadResult = {
  session: SessionPayload | null;
  reason?: "expired" | "invalid";
};

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET ?? "";
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";
  const minimumLength = isProduction ? 32 : 16;
  if (secret && secret.length >= minimumLength) {
    return secret;
  }

  if (!isProduction) {
    return "dev-only-auth-session-secret-please-change";
  }

  throw new Error("AUTH_SESSION_SECRET must be set and at least 32 characters.");
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
  try {
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
  } catch {
    return false;
  }
}

async function encodeSignedPayload(payload: object): Promise<string> {
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = await signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

async function decodeSignedPayload(token: string): Promise<unknown | null> {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const isValid = await verifySignature(payloadBase64, signature);
  if (!isValid) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(payloadBase64)) as unknown;
  } catch {
    return null;
  }
}

function isNotExpired(exp: number | undefined) {
  return typeof exp === "number" && Date.now() < exp;
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

  const rolePath = PORTAL_DASHBOARD_PATHS[role];
  return (
    nextPath === rolePath ||
    nextPath.startsWith(`${rolePath}/`) ||
    nextPath.startsWith(`${rolePath}?`) ||
    nextPath.startsWith(`${rolePath}#`)
  );
}

function isRetiredAdminSecurityPath(nextPath: string) {
  const pathname = nextPath.split(/[?#]/, 1)[0];
  return (
    pathname === RETIRED_ADMIN_SECURITY_PATH ||
    pathname.startsWith(`${RETIRED_ADMIN_SECURITY_PATH}/`)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(payload: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(payload).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUserRole(value: unknown): value is UserRole {
  return Object.values(UserRole).includes(value as UserRole);
}

function isValidExpiry(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isValidInitialSetupNextPath(value: unknown, role: UserRole) {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length <= MAX_INITIAL_SETUP_NEXT_PATH_LENGTH &&
    isSafePortalNextPath(value, role)
  );
}

function normalizeInitialSetupNextPath(nextPath: string | undefined, role: UserRole) {
  const normalized = nextPath?.trim();
  if (
    !normalized ||
    normalized.length > MAX_INITIAL_SETUP_NEXT_PATH_LENGTH ||
    !isSafePortalNextPath(normalized, role)
  ) {
    return undefined;
  }

  return normalized;
}

function isSessionPayload(payload: unknown): payload is SessionPayload {
  return Boolean(
    isRecord(payload) &&
      hasOnlyKeys(payload, [
        "purpose",
        "version",
        "uid",
        "role",
        "email",
        "fullName",
        "exp",
        "authMethod",
      ]) &&
      payload.purpose === "SESSION" &&
      payload.version === SESSION_SECURITY_VERSION &&
      isNonEmptyString(payload.uid) &&
      isUserRole(payload.role) &&
      isNonEmptyString(payload.email) &&
      (payload.fullName === undefined ||
        payload.fullName === null ||
        typeof payload.fullName === "string") &&
      isValidExpiry(payload.exp) &&
      (payload.authMethod === "password" || payload.authMethod === "sso"),
  );
}

function isInitialSetupPayload(payload: unknown): payload is InitialSetupPayload {
  if (
    !isRecord(payload) ||
    !hasOnlyKeys(payload, ["uid", "email", "role", "nextPath", "purpose", "exp"]) ||
    payload.purpose !== "INITIAL_SETUP" ||
    !isNonEmptyString(payload.uid) ||
    !isNonEmptyString(payload.email) ||
    !isUserRole(payload.role) ||
    !isValidExpiry(payload.exp)
  ) {
    return false;
  }

  return (
    payload.nextPath === undefined || isValidInitialSetupNextPath(payload.nextPath, payload.role)
  );
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
  if (role === UserRole.ADMIN && normalized && isRetiredAdminSecurityPath(normalized)) {
    return getPortalDashboardPath(role);
  }

  if (normalized && isSafePortalNextPath(normalized, role)) {
    return normalized;
  }

  return getPortalDashboardPath(role);
}

export async function prepareSessionCookie(input: SessionInput): Promise<PreparedSessionCookie> {
  const payload: SessionPayload = {
    purpose: "SESSION",
    version: SESSION_SECURITY_VERSION,
    uid: input.uid,
    role: input.role,
    email: input.email,
    fullName: input.fullName ?? null,
    exp: Date.now() + SESSION_DURATION_MS,
    authMethod: input.authMethod ?? "password",
  };

  return {
    name: SESSION_COOKIE,
    value: await encodeSignedPayload(payload),
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: (process.env.NODE_ENV ?? "development") === "production",
      path: "/",
      maxAge: SESSION_DURATION_MS / 1000,
    },
  };
}

export async function createSession(input: SessionInput) {
  const prepared = await prepareSessionCookie(input);
  const cookieStore = await cookies();
  cookieStore.set(prepared.name, prepared.value, prepared.options);
  cookieStore.delete(LEGACY_ADMIN_PENDING_2FA_COOKIE);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LEGACY_ADMIN_PENDING_2FA_COOKIE);
}

export async function createInitialSetupSession(
  input: Omit<InitialSetupPayload, "purpose" | "exp">,
) {
  const nextPath = normalizeInitialSetupNextPath(input.nextPath, input.role);
  const payload: InitialSetupPayload = {
    uid: input.uid,
    email: input.email,
    role: input.role,
    ...(nextPath ? { nextPath } : {}),
    purpose: "INITIAL_SETUP",
    exp: Date.now() + INITIAL_SETUP_DURATION_MS,
  };
  const cookieStore = await cookies();
  cookieStore.set(INITIAL_SETUP_COOKIE, await encodeSignedPayload(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.NODE_ENV ?? "development") === "production",
    path: "/",
    maxAge: INITIAL_SETUP_DURATION_MS / 1000,
  });
}

export async function getInitialSetupSession(): Promise<InitialSetupPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(INITIAL_SETUP_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = await decodeSignedPayload(token);
  if (!isInitialSetupPayload(payload) || !isNotExpired(payload.exp)) {
    return null;
  }

  const dbUser = await findUserById(payload.uid);
  if (!dbUser?.isActive || dbUser.role !== payload.role) {
    return null;
  }

  return payload;
}

export async function clearInitialSetupSession() {
  const cookieStore = await cookies();
  cookieStore.delete(INITIAL_SETUP_COOKIE);
}

async function revalidateSessionPayload(payload: SessionPayload): Promise<SessionPayload | null> {
  const dbUser = await findUserById(payload.uid);
  if (!dbUser?.isActive || dbUser.role !== payload.role) {
    return null;
  }

  return {
    ...payload,
    role: dbUser.role,
    email: dbUser.email,
    fullName: dbUser.fullName,
  };
}

async function readSessionFromCookie(): Promise<SessionReadResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return { session: null };
  }

  const payload = await decodeSignedPayload(token);
  if (!isSessionPayload(payload)) {
    return { session: null, reason: "invalid" };
  }

  if (!isNotExpired(payload.exp)) {
    return { session: null, reason: "expired" };
  }

  const session = await revalidateSessionPayload(payload);
  if (!session) {
    return { session: null, reason: "invalid" };
  }

  return { session };
}

export async function getSession(): Promise<SessionPayload | null> {
  return (await readSessionFromCookie()).session;
}

/**
 * Lightweight session verification for use in Middleware (Edge Runtime).
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const payload = await decodeSignedPayload(token);
  if (!isSessionPayload(payload)) {
    return null;
  }
  return payload;
}

export async function validateSession(sessionToken: string): Promise<SessionValidationResult> {
  const token = sessionToken?.trim();
  if (!token) {
    return { valid: false, expired: false, reason: "No session" };
  }

  const payload = await decodeSignedPayload(token);
  if (!isSessionPayload(payload)) {
    return { valid: false, expired: false, reason: "Invalid session" };
  }

  if (!isNotExpired(payload.exp)) {
    return { valid: false, expired: true, reason: "Session expired" };
  }

  const session = await revalidateSessionPayload(payload);
  if (!session) {
    return { valid: false, expired: false, reason: "Invalid session" };
  }

  return {
    valid: true,
    expired: false,
    user: {
      id: session.uid,
      role: session.role,
    },
  };
}

export async function requireSession() {
  const { session, reason } = await readSessionFromCookie();
  if (!session) {
    if (reason === "invalid") {
      redirect("/portal/login?reason=invalid");
    }
    if (reason === "expired") {
      redirect("/portal/login?reason=expired");
    }
    redirect("/portal/login");
  }
  return session;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const session = await requireSession();
  if (!allowedRoles.includes(session.role)) {
    redirect(getPortalDashboardPath(session.role));
  }

  return session;
}

export async function assertParentChildAccess(params: {
  parentId: string;
  childId: string;
  linkedChildIds: string[];
}) {
  if (params.linkedChildIds.includes(params.childId)) {
    return true;
  }

  throw new Error("Unauthorized");
}
