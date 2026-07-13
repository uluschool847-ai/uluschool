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

describe("session validation and expiry handling", () => {
  beforeEach(() => {
    vi.useRealTimers();
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

  it("returns a valid session payload for an active session", async () => {
    const validateSession = getValidateSession();
    const result = await validateSession?.("valid-session-token");
    expect(result).toEqual({
      valid: true,
      expired: false,
      user: { id: "user-1", role: "STUDENT" },
    });
  });

  it("returns expired=true for an expired session", async () => {
    const validateSession = getValidateSession();
    const result = await validateSession?.("expired-session-token");
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
    const validateSession = getValidateSession();
    const result = await validateSession?.("boundary-expired-token");
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

  it("clears ulu_session for an invalid protected session", async () => {
    const dbUser = makeDbUser({ isActive: false });
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: UserRole.TEACHER });
    cookieGetMock.mockReturnValue({ value: token });

    await expect(sessionModule.requireRole([UserRole.TEACHER])).rejects.toThrow();

    expect(cookieDeleteMock).toHaveBeenCalledWith("ulu_session");
  });

  it("still redirects invalid sessions when the current render context cannot clear cookies", async () => {
    const dbUser = makeDbUser({ isActive: false });
    setDbUser(dbUser);
    const token = await createSignedSessionToken({ uid: dbUser.id, role: UserRole.TEACHER });
    cookieGetMock.mockReturnValue({ value: token });
    cookieDeleteMock.mockImplementationOnce(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });

    await expect(sessionModule.requireRole([UserRole.TEACHER])).rejects.toThrow(
      "REDIRECT:/portal/login?reason=invalid",
    );
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
