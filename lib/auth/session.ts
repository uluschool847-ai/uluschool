import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getBackupCodeHashFingerprint } from "@/lib/auth/backup-code-hash";
import { findUserById } from "@/lib/repositories/user-repository";

const SESSION_COOKIE = "ulu_session";
const ADMIN_PENDING_2FA_COOKIE = "ulu_admin_2fa_pending";
const INITIAL_SETUP_COOKIE = "ulu_initial_setup";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const ADMIN_PENDING_2FA_DURATION_MS = 1000 * 60 * 10;
const INITIAL_SETUP_DURATION_MS = 1000 * 60 * 15;
const INITIAL_TWO_FACTOR_HANDOFF_DURATION_MS = 1000 * 60 * 10;
const MAX_INITIAL_SETUP_NEXT_PATH_LENGTH = 2048;
const MAX_INITIAL_TWO_FACTOR_CAPABILITY_LENGTH = 1024;

type AuthMethod = "password" | "sso";

type SessionInput = {
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  mfaVerified?: boolean;
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

type InitialTwoFactorSetupCapability = {
  purpose: "INITIAL_2FA_SETUP";
  uid: string;
  secretFingerprint: string;
  exp: number;
};

export type InitialTwoFactorHandoffCapability = {
  purpose: "INITIAL_2FA_HANDOFF";
  uid: string;
  backupCodeHashFingerprint: string;
  iat: number;
  exp: number;
};

export class AuthCookieReplacementError extends Error {
  constructor() {
    super("Auth cookie replacement failed");
    this.name = "AuthCookieReplacementError";
  }
}

export type SessionPayload = {
  purpose: "SESSION";
  uid: string;
  role: UserRole;
  email: string;
  fullName?: string | null;
  exp: number;
  mfaVerified: boolean;
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

type PendingTwoFactorPayload = {
  purpose: "ADMIN_PENDING_2FA";
  uid: string;
  email: string;
  exp: number;
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
        "uid",
        "role",
        "email",
        "fullName",
        "exp",
        "mfaVerified",
        "authMethod",
      ]) &&
      payload.purpose === "SESSION" &&
      isNonEmptyString(payload.uid) &&
      isUserRole(payload.role) &&
      isNonEmptyString(payload.email) &&
      (payload.fullName === undefined ||
        payload.fullName === null ||
        typeof payload.fullName === "string") &&
      isValidExpiry(payload.exp) &&
      typeof payload.mfaVerified === "boolean" &&
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

function isPendingTwoFactorPayload(payload: unknown): payload is PendingTwoFactorPayload {
  return Boolean(
    isRecord(payload) &&
      hasOnlyKeys(payload, ["purpose", "uid", "email", "exp"]) &&
      payload.purpose === "ADMIN_PENDING_2FA" &&
      isNonEmptyString(payload.uid) &&
      isNonEmptyString(payload.email) &&
      isValidExpiry(payload.exp),
  );
}

function isInitialTwoFactorSetupCapability(
  payload: unknown,
): payload is InitialTwoFactorSetupCapability {
  return Boolean(
    isRecord(payload) &&
      hasOnlyKeys(payload, ["purpose", "uid", "secretFingerprint", "exp"]) &&
      payload.purpose === "INITIAL_2FA_SETUP" &&
      isNonEmptyString(payload.uid) &&
      payload.uid === payload.uid.trim() &&
      payload.uid.length <= 191 &&
      typeof payload.secretFingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(payload.secretFingerprint) &&
      isValidExpiry(payload.exp),
  );
}

function isInitialTwoFactorHandoffCapability(
  payload: unknown,
): payload is InitialTwoFactorHandoffCapability {
  return Boolean(
    isRecord(payload) &&
      hasOnlyKeys(payload, ["purpose", "uid", "backupCodeHashFingerprint", "iat", "exp"]) &&
      payload.purpose === "INITIAL_2FA_HANDOFF" &&
      isNonEmptyString(payload.uid) &&
      payload.uid === payload.uid.trim() &&
      payload.uid.length <= 191 &&
      typeof payload.backupCodeHashFingerprint === "string" &&
      /^[a-f0-9]{64}$/.test(payload.backupCodeHashFingerprint) &&
      isValidExpiry(payload.iat) &&
      isValidExpiry(payload.exp),
  );
}

function hasValidInitialTwoFactorHandoffLifetime(payload: InitialTwoFactorHandoffCapability) {
  const now = Date.now();
  return (
    payload.iat <= now &&
    payload.exp > now &&
    payload.exp > payload.iat &&
    payload.exp - payload.iat <= INITIAL_TWO_FACTOR_HANDOFF_DURATION_MS
  );
}

export async function getInitialTwoFactorSecretFingerprint(secret: string) {
  if (!/^[A-Z2-7]{16,128}$/.test(secret)) {
    throw new Error("Invalid two-factor setup secret");
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createInitialTwoFactorSetupCapability(input: {
  uid: string;
  secret: string;
}) {
  if (!input.uid || input.uid !== input.uid.trim() || input.uid.length > 191) {
    throw new Error("Invalid initial setup identity");
  }

  return encodeSignedPayload({
    purpose: "INITIAL_2FA_SETUP",
    uid: input.uid,
    secretFingerprint: await getInitialTwoFactorSecretFingerprint(input.secret),
    exp: Date.now() + INITIAL_SETUP_DURATION_MS,
  } satisfies InitialTwoFactorSetupCapability);
}

export async function readInitialTwoFactorSetupCapability(
  token: string,
): Promise<InitialTwoFactorSetupCapability | null> {
  if (!token || token.length > MAX_INITIAL_TWO_FACTOR_CAPABILITY_LENGTH) {
    return null;
  }

  const payload = await decodeSignedPayload(token);
  if (!isInitialTwoFactorSetupCapability(payload) || !isNotExpired(payload.exp)) {
    return null;
  }

  return payload;
}

export async function createInitialTwoFactorHandoffCapability(input: {
  uid: string;
  backupCodeHashes: unknown;
}) {
  if (!input.uid || input.uid !== input.uid.trim() || input.uid.length > 191) {
    throw new Error("Invalid initial two-factor handoff identity");
  }

  const iat = Date.now();
  return encodeSignedPayload({
    purpose: "INITIAL_2FA_HANDOFF",
    uid: input.uid,
    backupCodeHashFingerprint: await getBackupCodeHashFingerprint(input.backupCodeHashes),
    iat,
    exp: iat + INITIAL_TWO_FACTOR_HANDOFF_DURATION_MS,
  } satisfies InitialTwoFactorHandoffCapability);
}

export async function readInitialTwoFactorHandoffCapability(
  token: unknown,
): Promise<InitialTwoFactorHandoffCapability | null> {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > MAX_INITIAL_TWO_FACTOR_CAPABILITY_LENGTH
  ) {
    return null;
  }

  const payload = await decodeSignedPayload(token);
  if (
    !isInitialTwoFactorHandoffCapability(payload) ||
    !hasValidInitialTwoFactorHandoffLifetime(payload)
  ) {
    return null;
  }

  return payload;
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

export async function prepareSessionCookie(input: SessionInput): Promise<PreparedSessionCookie> {
  const payload: SessionPayload = {
    purpose: "SESSION",
    uid: input.uid,
    role: input.role,
    email: input.email,
    fullName: input.fullName ?? null,
    exp: Date.now() + SESSION_DURATION_MS,
    mfaVerified: input.mfaVerified ?? true,
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
}

export async function replaceAuthCookieFamilyWithSession(prepared: PreparedSessionCookie) {
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;

  try {
    cookieStore = await cookies();
    cookieStore.set(prepared.name, prepared.value, prepared.options);
    cookieStore.delete(ADMIN_PENDING_2FA_COOKIE);
    cookieStore.delete(INITIAL_SETUP_COOKIE);
  } catch {
    try {
      cookieStore?.delete(SESSION_COOKIE);
    } catch {
      // A delivered handoff result carries separate short-lived recovery authorization.
    }
    throw new AuthCookieReplacementError();
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
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

function deleteSessionCookieIfWritable(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  try {
    cookieStore.delete(SESSION_COOKIE);
  } catch {
    // Layouts and other Server Component reads can detect invalid sessions but cannot mutate cookies.
  }
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
    deleteSessionCookieIfWritable(cookieStore);
    return { session: null, reason: "invalid" };
  }

  if (!isNotExpired(payload.exp)) {
    deleteSessionCookieIfWritable(cookieStore);
    return { session: null, reason: "expired" };
  }

  const session = await revalidateSessionPayload(payload);
  if (!session) {
    deleteSessionCookieIfWritable(cookieStore);
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

export async function createAdminPendingTwoFactor(input: { uid: string; email: string }) {
  const payload: PendingTwoFactorPayload = {
    purpose: "ADMIN_PENDING_2FA",
    uid: input.uid,
    email: input.email,
    exp: Date.now() + ADMIN_PENDING_2FA_DURATION_MS,
  };

  const token = await encodeSignedPayload(payload);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.NODE_ENV ?? "development") === "production",
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

  const payload = await decodeSignedPayload(token);
  if (!isPendingTwoFactorPayload(payload) || !isNotExpired(payload.exp)) {
    return null;
  }
  return payload;
}

export async function clearAdminPendingTwoFactor() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_PENDING_2FA_COOKIE);
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

  if (
    session.role === UserRole.ADMIN &&
    (process.env.ADMIN_REQUIRE_2FA ?? "true") !== "false" &&
    session.authMethod !== "sso" &&
    !session.mfaVerified
  ) {
    redirect("/portal/login/verify-2fa");
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
