import { UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SessionValidationResult = {
  valid: boolean;
  expired: boolean;
  reason?: string;
  user?: { id: string; role: string };
};

type DbUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword?: boolean;
};

const cookieDeleteMock = vi.hoisted(() => vi.fn());
const cookieGetMock = vi.hoisted(() => vi.fn());
const cookieSetMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
const findUserByIdMock = vi.hoisted(() => vi.fn());
const prismaFindUniqueMock = vi.hoisted(() => vi.fn());
const TEST_AUTH_SESSION_SECRET = "test-auth-session-secret-at-least-32-chars";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: cookieDeleteMock,
    get: cookieGetMock,
    set: cookieSetMock,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserById: findUserByIdMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appUser: {
      findUnique: prismaFindUniqueMock,
    },
  },
}));

import * as sessionModule from "@/lib/auth/session";

function getValidateSession() {
  return (
    sessionModule as unknown as {
      validateSession?: (
        sessionToken: string,
      ) => Promise<SessionValidationResult> | SessionValidationResult;
    }
  ).validateSession;
}

function setDbUser(user: DbUser | null) {
  findUserByIdMock.mockResolvedValue(user);
  prismaFindUniqueMock.mockResolvedValue(user);
}

function makeDbUser(overrides: Partial<DbUser> = {}): DbUser {
  return {
    id: "teacher-1",
    email: "teacher@example.com",
    fullName: "Teacher One",
    role: UserRole.TEACHER,
    isActive: true,
    ...overrides,
  };
}

async function createSignedSessionToken(input: {
  uid: string;
  role: UserRole;
  email?: string;
  fullName?: string | null;
}) {
  cookieSetMock.mockClear();
  await sessionModule.createSession({
    uid: input.uid,
    role: input.role,
    email: input.email ?? "teacher@example.com",
    fullName: input.fullName ?? "Teacher One",
  });
  const token = cookieSetMock.mock.calls.find(([name]) => name === "ulu_session")?.[1];
  expect(token).toEqual(expect.any(String));
  return token as string;
}

async function createSignedPendingTwoFactorToken(
  input: {
    uid?: string;
    email?: string;
    challengeId?: string;
    authMethod?: "password" | "sso";
    expiresAt?: Date;
  } = {},
) {
  cookieSetMock.mockClear();
  await sessionModule.createAdminPendingTwoFactor({
    uid: input.uid ?? "admin-1",
    email: input.email ?? "admin@example.com",
    challengeId: input.challengeId ?? "challenge-1",
    authMethod: input.authMethod ?? "password",
    expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000),
  });
  const token = cookieSetMock.mock.calls.find(([name]) => name === "ulu_admin_2fa_pending")?.[1];
  expect(token).toEqual(expect.any(String));
  return token as string;
}

async function createSignedInitialSetupToken(
  input: {
    uid?: string;
    email?: string;
    role?: UserRole;
    nextPath?: string;
  } = {},
) {
  cookieSetMock.mockClear();
  await sessionModule.createInitialSetupSession({
    uid: input.uid ?? "teacher-1",
    email: input.email ?? "teacher@example.com",
    role: input.role ?? UserRole.TEACHER,
    ...(input.nextPath ? { nextPath: input.nextPath } : {}),
  });
  const token = cookieSetMock.mock.calls.find(([name]) => name === "ulu_initial_setup")?.[1];
  expect(token).toEqual(expect.any(String));
  return token as string;
}

function toBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createSignedTestPayload(payload: Record<string, unknown>) {
  const encoder = new TextEncoder();
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TEST_AUTH_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  const signatureString = Array.from(new Uint8Array(signature), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return `${payloadBase64}.${toBase64Url(signatureString)}`;
}

describe("session validation and expiry handling", () => {
  beforeEach(() => {
    vi.useRealTimers();
    process.env.AUTH_SESSION_SECRET = TEST_AUTH_SESSION_SECRET;
    process.env.NODE_ENV = "test";
    cookieDeleteMock.mockReset();
    cookieGetMock.mockReset();
    cookieSetMock.mockReset();
    redirectMock.mockClear();
    findUserByIdMock.mockReset();
    prismaFindUniqueMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(process.env, "AUTH_SESSION_SECRET");
    process.env.NODE_ENV = "test";
  });

  describe("restricted initial setup session", () => {
    it("creates and reads a signed 15-minute purpose-bound setup cookie", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
      const dbUser = makeDbUser();
      setDbUser(dbUser);

      const token = await createSignedInitialSetupToken({
        uid: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        nextPath: "/portal/teacher/assignments",
      });

      expect(cookieSetMock).toHaveBeenCalledWith(
        "ulu_initial_setup",
        token,
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          secure: false,
          path: "/",
          maxAge: 15 * 60,
        }),
      );

      cookieGetMock.mockImplementation((name: string) =>
        name === "ulu_initial_setup" ? { value: token } : undefined,
      );

      await expect(sessionModule.getInitialSetupSession()).resolves.toEqual({
        uid: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        nextPath: "/portal/teacher/assignments",
        purpose: "INITIAL_SETUP",
        exp: new Date("2026-07-14T10:15:00.000Z").getTime(),
      });
    });

    it("rejects a valid signed payload with the wrong purpose", async () => {
      const dbUser = makeDbUser();
      setDbUser(dbUser);
      const normalSessionToken = await createSignedSessionToken({
        uid: dbUser.id,
        role: dbUser.role,
        email: dbUser.email,
      });
      cookieGetMock.mockReturnValue({ value: normalSessionToken });

      await expect(sessionModule.getInitialSetupSession()).resolves.toBeNull();
    });

    it.each([
      ["missing uid", { uid: undefined }],
      ["invalid role", { role: "OWNER" }],
      ["malformed expiry", { exp: "never" }],
      ["invalid optional nextPath", { nextPath: 42 }],
      ["unknown field", { unexpected: true }],
    ])("rejects a signed setup payload with %s", async (_case, overrides) => {
      const token = await createSignedTestPayload({
        uid: "teacher-1",
        email: "teacher@example.com",
        role: UserRole.TEACHER,
        purpose: "INITIAL_SETUP",
        exp: Date.now() + 60_000,
        ...overrides,
      });
      cookieGetMock.mockReturnValue({ value: token });

      await expect(sessionModule.getInitialSetupSession()).resolves.toBeNull();
      expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it("rejects a tampered setup cookie", async () => {
      setDbUser(makeDbUser());
      const token = await createSignedInitialSetupToken();
      const replacement = token.startsWith("x") ? "y" : "x";
      cookieGetMock.mockReturnValue({ value: `${replacement}${token.slice(1)}` });

      await expect(sessionModule.getInitialSetupSession()).resolves.toBeNull();
      expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it("rejects an expired setup cookie", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
      setDbUser(makeDbUser());
      const token = await createSignedInitialSetupToken();
      cookieGetMock.mockReturnValue({ value: token });
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      await expect(sessionModule.getInitialSetupSession()).resolves.toBeNull();
      expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it("rejects a setup cookie exactly at its expiry boundary", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
      setDbUser(makeDbUser());
      const token = await createSignedInitialSetupToken();
      cookieGetMock.mockReturnValue({ value: token });
      vi.advanceTimersByTime(15 * 60 * 1000);

      await expect(sessionModule.getInitialSetupSession()).resolves.toBeNull();
      expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it.each([
      ["sibling role prefix", "/portal/teacher-other", undefined],
      ["external URL", "https://example.com/portal/teacher", undefined],
      ["overlong path", `/portal/teacher/${"a".repeat(2048)}`, undefined],
      [
        "trimmed role child",
        "  /portal/teacher/assignments?view=past  ",
        "/portal/teacher/assignments?view=past",
      ],
    ])("omits an unsafe %s setup nextPath before signing", async (_case, nextPath, expected) => {
      const dbUser = makeDbUser();
      setDbUser(dbUser);
      const token = await createSignedInitialSetupToken({ nextPath });
      cookieGetMock.mockReturnValue({ value: token });

      const payload = await sessionModule.getInitialSetupSession();

      if (expected) {
        expect(payload).toEqual(expect.objectContaining({ nextPath: expected }));
      } else {
        expect(payload).not.toHaveProperty("nextPath");
      }
    });

    it("uses segment-aware role prefixes for final redirects", () => {
      expect(sessionModule.getPortalRedirectPath(UserRole.TEACHER, "/portal/teacher-other")).toBe(
        "/portal/teacher",
      );
      expect(sessionModule.getPortalRedirectPath(UserRole.ADMIN, "/administrator")).toBe("/admin");
      expect(sessionModule.getPortalRedirectPath(UserRole.ADMIN, "/admin?tab=security")).toBe(
        "/admin?tab=security",
      );
    });

    it.each([
      ["deleted", null],
      ["inactive", makeDbUser({ isActive: false })],
      ["role-changed", makeDbUser({ role: UserRole.STUDENT })],
    ])("rejects a setup cookie when its user is %s", async (_state, currentUser) => {
      setDbUser(currentUser);
      const token = await createSignedInitialSetupToken();
      cookieGetMock.mockReturnValue({ value: token });

      await expect(sessionModule.getInitialSetupSession()).resolves.toBeNull();
    });

    it("clears the restricted setup cookie", async () => {
      await sessionModule.clearInitialSetupSession();

      expect(cookieDeleteMock).toHaveBeenCalledWith("ulu_initial_setup");
    });

    it("requires at least 32 secret characters in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.AUTH_SESSION_SECRET = "x".repeat(31);

      await expect(
        sessionModule.createInitialSetupSession({
          uid: "teacher-1",
          email: "teacher@example.com",
          role: UserRole.TEACHER,
        }),
      ).rejects.toThrow("AUTH_SESSION_SECRET must be set and at least 32 characters.");
      expect(cookieSetMock).not.toHaveBeenCalled();
    });

    it("accepts a 32-character production secret", async () => {
      process.env.NODE_ENV = "production";
      process.env.AUTH_SESSION_SECRET = "x".repeat(32);

      await createSignedInitialSetupToken();

      expect(cookieSetMock).toHaveBeenCalledWith(
        "ulu_initial_setup",
        expect.any(String),
        expect.objectContaining({ secure: true }),
      );
    });
  });

  describe("signed auth payload purpose separation", () => {
    it("includes SESSION purpose and accepts a valid normal session", async () => {
      const token = await createSignedSessionToken({ uid: "teacher-1", role: UserRole.TEACHER });

      await expect(sessionModule.verifySessionToken(token)).resolves.toEqual(
        expect.objectContaining({ purpose: "SESSION", version: 2, uid: "teacher-1" }),
      );
    });

    it.each([
      ["legacy password session", UserRole.TEACHER, "password", undefined],
      ["legacy SSO MFA-bypass session", UserRole.ADMIN, "sso", undefined],
      ["older versioned password session", UserRole.TEACHER, "password", 1],
    ] as const)(
      "rejects a signed %s in backend and lightweight readers",
      async (_case, role, authMethod, version) => {
        const uid = role === UserRole.ADMIN ? "admin-1" : "teacher-1";
        const email = role === UserRole.ADMIN ? "admin@example.com" : "teacher@example.com";
        const token = await createSignedTestPayload({
          purpose: "SESSION",
          ...(version !== undefined ? { version } : {}),
          uid,
          role,
          email,
          fullName: null,
          exp: Date.now() + 60_000,
          mfaVerified: true,
          authMethod,
        });
        setDbUser(makeDbUser({ id: uid, email, role }));
        cookieGetMock.mockImplementation((name: string) =>
          name === "ulu_session" ? { value: token } : undefined,
        );

        await expect(sessionModule.getSession()).resolves.toBeNull();
        await expect(sessionModule.verifySessionToken(token)).resolves.toBeNull();
        await expect(sessionModule.validateSession(token)).resolves.toEqual({
          valid: false,
          expired: false,
          reason: "Invalid session",
        });
        expect(findUserByIdMock).not.toHaveBeenCalled();
      },
    );

    it("rejects a setup token in every normal-session reader before DB revalidation", async () => {
      setDbUser(makeDbUser());
      const token = await createSignedInitialSetupToken();
      cookieGetMock.mockImplementation((name: string) =>
        name === "ulu_session" ? { value: token } : undefined,
      );

      await expect(sessionModule.getSession()).resolves.toBeNull();
      await expect(sessionModule.verifySessionToken(token)).resolves.toBeNull();
      await expect(sessionModule.validateSession(token)).resolves.toEqual({
        valid: false,
        expired: false,
        reason: "Invalid session",
      });
      expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it("rejects a setup token renamed to the pending-admin cookie", async () => {
      const token = await createSignedInitialSetupToken();
      cookieGetMock.mockImplementation((name: string) =>
        name === "ulu_admin_2fa_pending" ? { value: token } : undefined,
      );
      cookieDeleteMock.mockImplementation(() => {
        throw new Error("Server Component cookies are read-only");
      });

      await expect(sessionModule.getAdminPendingTwoFactor()).resolves.toBeNull();
      expect(cookieDeleteMock).not.toHaveBeenCalled();
    });

    it("purpose-binds pending-admin tokens and rejects them as normal or setup sessions", async () => {
      const token = await createSignedPendingTwoFactorToken();
      cookieGetMock.mockImplementation((name: string) =>
        name === "ulu_initial_setup" ? { value: token } : undefined,
      );

      await expect(sessionModule.getAdminPendingTwoFactor()).resolves.toBeNull();
      cookieGetMock.mockImplementation((name: string) =>
        name === "ulu_admin_2fa_pending" ? { value: token } : undefined,
      );
      await expect(sessionModule.getAdminPendingTwoFactor()).resolves.toEqual(
        expect.objectContaining({
          purpose: "ADMIN_PENDING_2FA",
          challengeId: "challenge-1",
          authMethod: "password",
        }),
      );
      await expect(sessionModule.verifySessionToken(token)).resolves.toBeNull();
      cookieGetMock.mockImplementation((name: string) =>
        name === "ulu_initial_setup" ? { value: token } : undefined,
      );
      await expect(sessionModule.getInitialSetupSession()).resolves.toBeNull();
      expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it.each([
      ["missing purpose", { purpose: undefined }],
      ["missing email", { email: undefined }],
      ["missing challenge id", { challengeId: undefined }],
      ["missing auth method", { authMethod: undefined }],
      ["unsupported auth method", { authMethod: "magic" }],
      ["malformed expiry", { exp: 1.5 }],
      ["unknown field", { unexpected: true }],
    ])("rejects a signed pending-admin payload with %s", async (_case, overrides) => {
      const token = await createSignedTestPayload({
        purpose: "ADMIN_PENDING_2FA",
        uid: "admin-1",
        email: "admin@example.com",
        challengeId: "challenge-1",
        authMethod: "password",
        exp: Date.now() + 60_000,
        ...overrides,
      });
      cookieGetMock.mockImplementation((name: string) =>
        name === "ulu_admin_2fa_pending" ? { value: token } : undefined,
      );

      await expect(sessionModule.getAdminPendingTwoFactor()).resolves.toBeNull();
    });

    it("rejects a pending-admin token exactly at its expiry boundary", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
      const token = await createSignedPendingTwoFactorToken();
      cookieGetMock.mockReturnValue({ value: token });
      cookieDeleteMock.mockImplementation(() => {
        throw new Error("Server Component cookies are read-only");
      });
      vi.advanceTimersByTime(10 * 60 * 1000);

      await expect(sessionModule.getAdminPendingTwoFactor()).resolves.toBeNull();
      expect(cookieDeleteMock).not.toHaveBeenCalled();
    });

    it.each([
      ["missing purpose", { purpose: undefined }],
      ["wrong purpose", { purpose: "INITIAL_SETUP" }],
      ["missing uid", { purpose: "SESSION", uid: undefined }],
      ["invalid role", { purpose: "SESSION", role: "OWNER" }],
      ["invalid auth method", { purpose: "SESSION", authMethod: "magic" }],
      ["invalid MFA value", { purpose: "SESSION", mfaVerified: "true" }],
      ["malformed expiry", { purpose: "SESSION", exp: "never" }],
      ["invalid optional fullName", { purpose: "SESSION", fullName: 42 }],
      ["unknown field", { purpose: "SESSION", unexpected: true }],
    ])("rejects a signed normal-session payload with %s", async (_case, overrides) => {
      const token = await createSignedTestPayload({
        purpose: "SESSION",
        version: 2,
        uid: "teacher-1",
        role: UserRole.TEACHER,
        email: "teacher@example.com",
        fullName: null,
        exp: Date.now() + 60_000,
        mfaVerified: true,
        authMethod: "password",
        ...overrides,
      });

      await expect(sessionModule.verifySessionToken(token)).resolves.toBeNull();
      expect(findUserByIdMock).not.toHaveBeenCalled();
    });
  });

  it("returns a valid session payload for an active session", async () => {
    const dbUser = makeDbUser({ id: "user-1", role: UserRole.STUDENT });
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: dbUser.role });
    const validateSession = getValidateSession();
    const result = await validateSession?.(token);
    expect(result).toEqual({
      valid: true,
      expired: false,
      user: { id: "user-1", role: "STUDENT" },
    });
  });

  it("returns expired=true for an expired session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));
    const token = await createSignedSessionToken({ uid: "user-1", role: UserRole.STUDENT });
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);
    const validateSession = getValidateSession();
    const result = await validateSession?.(token);
    expect(result).toEqual({
      valid: false,
      expired: true,
      reason: "Session expired",
    });
  });

  it("returns invalid session for an unknown token", async () => {
    const validateSession = getValidateSession();
    const result = await validateSession?.("unknown-token");
    expect(result).toEqual({
      valid: false,
      expired: false,
      reason: "Invalid session",
    });
  });

  it("returns invalid session for a tampered token", async () => {
    const validateSession = getValidateSession();
    const result = await validateSession?.("tampered.token.signature");
    expect(result).toEqual({
      valid: false,
      expired: false,
      reason: "Invalid session",
    });
  });

  it("returns no-session for a missing token", async () => {
    const validateSession = getValidateSession();
    const result = await validateSession?.("");
    expect(result).toEqual({
      valid: false,
      expired: false,
      reason: "No session",
    });
  });

  it("treats a token exactly at the expiry boundary as expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));
    const token = await createSignedSessionToken({ uid: "user-1", role: UserRole.STUDENT });
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

    await expect(sessionModule.verifySessionToken(token)).resolves.toEqual(
      expect.objectContaining({ purpose: "SESSION", exp: Date.now() }),
    );

    const validateSession = getValidateSession();
    const result = await validateSession?.(token);
    expect(result).toEqual({
      valid: false,
      expired: true,
      reason: "Session expired",
    });
  });

  it("keeps an active TEACHER session valid after DB revalidation", async () => {
    const dbUser = makeDbUser();
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: UserRole.TEACHER });

    const result = await getValidateSession()?.(token);

    expect(result).toEqual({
      valid: true,
      expired: false,
      user: { id: dbUser.id, role: UserRole.TEACHER },
    });
  });

  it("invalidates a session when the uid no longer exists in DB", async () => {
    setDbUser(null);
    const token = await createSignedSessionToken({
      uid: "deleted-teacher",
      role: UserRole.TEACHER,
    });

    await expect(getValidateSession()?.(token)).resolves.toEqual({
      valid: false,
      expired: false,
      reason: "Invalid session",
    });
  });

  it("invalidates a session when the DB user is inactive", async () => {
    const dbUser = makeDbUser({ isActive: false });
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: UserRole.TEACHER });

    await expect(getValidateSession()?.(token)).resolves.toEqual({
      valid: false,
      expired: false,
      reason: "Invalid session",
    });
  });

  it("invalidates teacher access when the DB role changed from TEACHER to STUDENT", async () => {
    const dbUser = makeDbUser({ role: UserRole.STUDENT });
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: UserRole.TEACHER });
    cookieGetMock.mockReturnValue({ value: token });

    await expect(sessionModule.requireRole([UserRole.TEACHER])).rejects.toThrow(
      "REDIRECT:/portal/login?reason=invalid",
    );
  });

  it("does not mutate ulu_session while reading an invalid protected session", async () => {
    const dbUser = makeDbUser({ isActive: false });
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: UserRole.TEACHER });
    cookieGetMock.mockReturnValue({ value: token });
    cookieDeleteMock.mockImplementation(() => {
      throw new Error("Server Component cookies are read-only");
    });

    await expect(sessionModule.requireRole([UserRole.TEACHER])).rejects.toThrow();

    expect(cookieDeleteMock).not.toHaveBeenCalled();
  });

  it("redirects invalid protected sessions to the invalid-session login reason", async () => {
    setDbUser(null);
    const token = await createSignedSessionToken({
      uid: "missing-teacher",
      role: UserRole.TEACHER,
    });
    cookieGetMock.mockReturnValue({ value: token });

    await expect(sessionModule.requireRole([UserRole.TEACHER])).rejects.toThrow(
      "REDIRECT:/portal/login?reason=invalid",
    );
  });

  it("uses server-side DB user state as source of truth instead of the cookie role snapshot", async () => {
    const dbUser = makeDbUser({ role: UserRole.STUDENT });
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: UserRole.TEACHER });

    const result = await getValidateSession()?.(token);

    expect(result).toEqual({
      valid: false,
      expired: false,
      reason: "Invalid session",
    });
  });
});
