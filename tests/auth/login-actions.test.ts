import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyPasswordMock = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const findUserByEmailMock = vi.hoisted(() => vi.fn());
const createSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const createInitialSetupSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const clearSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const clearInitialSetupSessionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

// Mock redirect to throw an error so we can catch and assert it
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

// Mock repositories and session so the action can run without database
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: verifyPasswordMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserByEmail: findUserByEmailMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: vi.fn(() => Promise.resolve()),
  logAuthEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/auth/session", () => ({
  createSession: createSessionMock,
  createInitialSetupSession: createInitialSetupSessionMock,
  clearSession: clearSessionMock,
  clearInitialSetupSession: clearInitialSetupSessionMock,
  getPortalRedirectPath: vi.fn((role, nextPath) => {
    // Emulate proper nextPath resolution
    if (nextPath) return nextPath;
    return role === "ADMIN" ? "/admin" : `/portal/${role.toLowerCase()}`;
  }),
}));

function expectAllAuthCookiesClearedBefore(issueMock: ReturnType<typeof vi.fn>) {
  expect(clearSessionMock).toHaveBeenCalledOnce();
  expect(clearInitialSetupSessionMock).toHaveBeenCalledOnce();

  const issueOrder = issueMock.mock.invocationCallOrder[0];
  expect(issueOrder).toBeDefined();
  expect(clearSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
  expect(clearInitialSetupSessionMock.mock.invocationCallOrder[0]).toBeLessThan(issueOrder);
}

function mailboxAddress(length: 254 | 255) {
  const address = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(
    length === 254 ? 61 : 62,
  )}`;
  expect(address).toHaveLength(length);
  return address;
}

describe("Auth Server Actions - Next Parameter Resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    findUserByEmailMock.mockResolvedValue({
      id: "user-1",
      email: "test@uluglobalacademy.com",
      fullName: "Student User",
      role: "STUDENT",
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: false,
      twoFactorEnabled: false,
    });
  });

  it("parses the next parameter and redirects to the exact intended path upon successful login", async () => {
    const { loginAction } = await import("@/app/portal/login/actions");

    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "ValidPass123!");
    formData.set("next", "/portal/student/assignments?view=past");

    // The action should parse 'next' and ultimately call redirect("/portal/student/assignments?view=past")
    await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/student/assignments?view=past",
    );
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1", role: "STUDENT", authMethod: "password" }),
    );
    expectAllAuthCookiesClearedBefore(createSessionMock);
    expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
  });

  it("routes a temporary-password user to password setup without a normal session", async () => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "user-1",
      email: "test@uluglobalacademy.com",
      fullName: "Student User",
      role: "STUDENT",
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: true,
      twoFactorEnabled: false,
    });
    const { loginAction } = await import("@/app/portal/login/actions");
    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "ValidPass123!");
    formData.set("next", "/portal/student/assignments");

    await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/setup/password",
    );

    expectAllAuthCookiesClearedBefore(createInitialSetupSessionMock);
    expect(createInitialSetupSessionMock).toHaveBeenCalledWith({
      uid: "user-1",
      email: "test@uluglobalacademy.com",
      role: "STUDENT",
      nextPath: "/portal/student/assignments",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("does not clear or issue auth cookies when password verification fails", async () => {
    verifyPasswordMock.mockResolvedValueOnce(false);
    const { loginAction } = await import("@/app/portal/login/actions");
    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "WrongPass123!");

    await expect(loginAction({ success: false, message: "" }, formData)).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );

    expect(clearSessionMock).not.toHaveBeenCalled();
    expect(clearInitialSetupSessionMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["email", new File(["not-an-email"], "email.txt"), false],
    ["password", new File(["not-a-password"], "password.txt"), false],
    ["email", null, true],
    ["password", null, true],
  ])(
    "returns invalid input before authentication when %s is not a string",
    async (field, value, omit) => {
      const { loginAction } = await import("@/app/portal/login/actions");
      const formData = new FormData();
      formData.set("email", "student@uluglobalacademy.com");
      formData.set("password", "ValidPass123!");
      if (omit) {
        formData.delete(field);
      } else {
        formData.set(field, value);
      }

      await expect(loginAction({ success: false, message: "" }, formData)).resolves.toEqual(
        expect.objectContaining({ success: false, message: "Invalid input" }),
      );

      expect(findUserByEmailMock).not.toHaveBeenCalled();
      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(clearSessionMock).not.toHaveBeenCalled();
      expect(clearInitialSetupSessionMock).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
      expect(createInitialSetupSessionMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [254, true],
    [255, false],
  ] as const)(
    "accepts 254 and rejects 255 mailbox characters before authentication: %i / %s",
    async (length, accepted) => {
      const email = mailboxAddress(length);
      const { loginAction } = await import("@/app/portal/login/actions");
      const formData = new FormData();
      formData.set("email", email);
      formData.set("password", "ValidPass123!");

      if (accepted) {
        await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
          "REDIRECT:/portal/student",
        );
        expect(findUserByEmailMock).toHaveBeenCalledWith(email);
        expect(verifyPasswordMock).toHaveBeenCalled();
        return;
      }

      await expect(loginAction({ success: false, message: "" }, formData)).resolves.toEqual(
        expect.objectContaining({ success: false, message: "Invalid input" }),
      );
      expect(findUserByEmailMock).not.toHaveBeenCalled();
      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(clearSessionMock).not.toHaveBeenCalled();
      expect(createSessionMock).not.toHaveBeenCalled();
    },
  );

  it("omits a File-valued next parameter from the temporary-password setup session", async () => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "user-1",
      email: "test@uluglobalacademy.com",
      fullName: "Student User",
      role: "STUDENT",
      isActive: true,
      passwordHash: "hashed",
      mustChangePassword: true,
      twoFactorEnabled: false,
    });
    const { loginAction } = await import("@/app/portal/login/actions");
    const formData = new FormData();
    formData.set("email", "student@uluglobalacademy.com");
    formData.set("password", "ValidPass123!");
    formData.set("next", new File(["not-a-route"], "next.txt"));

    await expect(loginAction({ success: false, message: "" }, formData)).rejects.toThrow(
      "REDIRECT:/portal/setup/password",
    );

    expect(createInitialSetupSessionMock).toHaveBeenCalledWith({
      uid: "user-1",
      email: "test@uluglobalacademy.com",
      role: "STUDENT",
    });
  });
});
