import { UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSetMock = vi.hoisted(() => vi.fn());
const cookieDeleteMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/repositories/user-repository", () => ({ findUserById: vi.fn() }));

type SessionModule = typeof import("@/lib/auth/session");

async function loadSession() {
  return import("@/lib/auth/session") as Promise<SessionModule>;
}

describe("initial 2FA signed setup capability", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({ set: cookieSetMock, delete: cookieDeleteMock });
  });

  it("binds a bounded secret fingerprint to the signed server-derived admin identity", async () => {
    const { createInitialTwoFactorSetupCapability, readInitialTwoFactorSetupCapability } =
      await loadSession();

    const capability = await createInitialTwoFactorSetupCapability({
      uid: "admin-1",
      secret: "JBSWY3DPEHPK3PXP",
    });
    const result = await readInitialTwoFactorSetupCapability(capability);

    expect(capability.length).toBeLessThanOrEqual(1024);
    expect(result).toMatchObject({ uid: "admin-1", purpose: "INITIAL_2FA_SETUP" });
    expect(result?.secretFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("JBSWY3DPEHPK3PXP");
  });

  it("rejects tampered and oversized capabilities", async () => {
    const { createInitialTwoFactorSetupCapability, readInitialTwoFactorSetupCapability } =
      await loadSession();
    const capability = await createInitialTwoFactorSetupCapability({
      uid: "admin-1",
      secret: "JBSWY3DPEHPK3PXP",
    });
    const [payload, signature] = capability.split(".");
    const tamperedPayload = `${payload.slice(0, -2)}AA`;

    await expect(
      readInitialTwoFactorSetupCapability(`${tamperedPayload}.${signature}`),
    ).resolves.toBeNull();
    await expect(readInitialTwoFactorSetupCapability("x".repeat(1025))).resolves.toBeNull();
  });
});

describe("auth cookie family replacement", () => {
  const sessionInput = {
    uid: "admin-1",
    role: UserRole.ADMIN,
    email: "admin@example.com",
    fullName: "Admin One",
    mfaVerified: true,
    authMethod: "password" as const,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({ set: cookieSetMock, delete: cookieDeleteMock });
  });

  it("precomputes fallible session material without accessing response cookies", async () => {
    const { prepareSessionCookie } = await loadSession();

    const prepared = await prepareSessionCookie(sessionInput);

    expect(prepared.name).toBe("ulu_session");
    expect(prepared.value).toEqual(expect.any(String));
    expect(prepared.value).not.toContain("admin@example.com");
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it("sets one normal session and clears both competing cookie families", async () => {
    const { prepareSessionCookie, replaceAuthCookieFamilyWithSession } = await loadSession();
    const prepared = await prepareSessionCookie(sessionInput);

    await replaceAuthCookieFamilyWithSession(prepared);

    expect(cookieSetMock).toHaveBeenCalledOnce();
    expect(cookieSetMock).toHaveBeenCalledWith("ulu_session", prepared.value, prepared.options);
    expect(cookieDeleteMock.mock.calls).toEqual([["ulu_admin_2fa_pending"], ["ulu_initial_setup"]]);
  });

  it.each([
    ["normal session write", "set", 1],
    ["pending-2FA clear", "delete", 1],
    ["initial-setup clear", "delete", 2],
  ])("reports a typed replacement failure for %s faults", async (_label, operation, call) => {
    if (operation === "set") {
      cookieSetMock.mockImplementationOnce(() => {
        throw new Error("sensitive session write failure");
      });
    } else {
      let deleteCall = 0;
      cookieDeleteMock.mockImplementation(() => {
        deleteCall += 1;
        if (deleteCall === call) {
          throw new Error("sensitive competing-cookie clear failure");
        }
      });
    }

    const { AuthCookieReplacementError, prepareSessionCookie, replaceAuthCookieFamilyWithSession } =
      await loadSession();
    const prepared = await prepareSessionCookie(sessionInput);

    await expect(replaceAuthCookieFamilyWithSession(prepared)).rejects.toBeInstanceOf(
      AuthCookieReplacementError,
    );
    expect(JSON.stringify(cookieSetMock.mock.calls)).not.toContain("sensitive");
  });
});
