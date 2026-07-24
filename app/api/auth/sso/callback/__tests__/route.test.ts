import { createHmac } from "node:crypto";

import { UserRole } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createSessionMock = vi.hoisted(() => vi.fn());
const clearInitialSetupSessionMock = vi.hoisted(() => vi.fn());
const createAdminAuditLogMock = vi.hoisted(() => vi.fn());
const findUserByEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  createSession: createSessionMock,
  clearInitialSetupSession: clearInitialSetupSessionMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  createAdminAuditLog: createAdminAuditLogMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  findUserByEmail: findUserByEmailMock,
}));

import { GET } from "../route";

const SSO_SECRET = "local-sso-shared-secret";
const ADMIN_EMAIL = "sso.admin@example.com";

function makeSignature(email: string, timestamp: string, secret = SSO_SECRET) {
  return createHmac("sha256", secret).update(`${email}:${timestamp}`).digest("hex");
}

function makeCallbackUrl(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/auth/sso/callback");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function callSsoCallback(params: Record<string, string>) {
  return GET(new Request(makeCallbackUrl(params)));
}

describe("admin SSO callback route", () => {
  const originalEnv = {
    ADMIN_SSO_ENABLED: process.env.ADMIN_SSO_ENABLED,
    ADMIN_SSO_SHARED_SECRET: process.env.ADMIN_SSO_SHARED_SECRET,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SSO_ENABLED = "true";
    process.env.ADMIN_SSO_SHARED_SECRET = SSO_SECRET;
    findUserByEmailMock.mockResolvedValue({
      id: "admin-1",
      email: ADMIN_EMAIL,
      fullName: "SSO Admin",
      role: UserRole.ADMIN,
      isActive: true,
      mustChangePassword: false,
    });
  });

  afterEach(() => {
    process.env.ADMIN_SSO_ENABLED = originalEnv.ADMIN_SSO_ENABLED;
    process.env.ADMIN_SSO_SHARED_SECRET = originalEnv.ADMIN_SSO_SHARED_SECRET;
  });

  it("rejects SSO when the feature flag is disabled", async () => {
    process.env.ADMIN_SSO_ENABLED = "false";
    const ts = String(Date.now());

    const response = await callSsoCallback({
      email: ADMIN_EMAIL,
      ts,
      sig: makeSignature(ADMIN_EMAIL, ts),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "SSO disabled" });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects missing callback parameters before touching user or session state", async () => {
    const response = await callSsoCallback({ email: ADMIN_EMAIL });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Missing SSO parameters",
    });
    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects expired callback timestamps", async () => {
    const ts = String(Date.now() - 1000 * 60 * 10);
    const response = await callSsoCallback({
      email: ADMIN_EMAIL,
      ts,
      sig: makeSignature(ADMIN_EMAIL, ts),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Expired SSO request" });
    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures and missing shared secret", async () => {
    const ts = String(Date.now());
    const invalidSignatureResponse = await callSsoCallback({
      email: ADMIN_EMAIL,
      ts,
      sig: makeSignature(ADMIN_EMAIL, ts, "wrong-secret"),
    });
    expect(invalidSignatureResponse.status).toBe(401);
    await expect(invalidSignatureResponse.json()).resolves.toEqual({
      ok: false,
      error: "Invalid SSO signature",
    });

    process.env.ADMIN_SSO_SHARED_SECRET = "";
    const missingSecretResponse = await callSsoCallback({
      email: ADMIN_EMAIL,
      ts,
      sig: makeSignature(ADMIN_EMAIL, ts),
    });
    expect(missingSecretResponse.status).toBe(401);
    await expect(missingSecretResponse.json()).resolves.toEqual({
      ok: false,
      error: "Invalid SSO signature",
    });

    expect(findUserByEmailMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it.each([
    { role: UserRole.STUDENT, isActive: true },
    { role: UserRole.TEACHER, isActive: true },
    { role: UserRole.PARENT, isActive: true },
    { role: UserRole.ADMIN, isActive: false },
  ])("rejects non-admin or inactive users: %o", async (userPatch) => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "not-allowed-1",
      email: ADMIN_EMAIL,
      fullName: "Not Allowed",
      ...userPatch,
    });
    const ts = String(Date.now());

    const response = await callSsoCallback({
      email: ADMIN_EMAIL,
      ts,
      sig: makeSignature(ADMIN_EMAIL, ts),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Admin user is not allowed for SSO",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(createAdminAuditLogMock).not.toHaveBeenCalled();
  });

  it("rejects an administrator that must complete local password setup", async () => {
    findUserByEmailMock.mockResolvedValueOnce({
      id: "admin-1",
      email: ADMIN_EMAIL,
      fullName: "SSO Admin",
      role: UserRole.ADMIN,
      isActive: true,
      mustChangePassword: true,
    });
    const ts = String(Date.now());

    const response = await callSsoCallback({
      email: ADMIN_EMAIL,
      ts,
      sig: makeSignature(ADMIN_EMAIL, ts),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Admin user must complete local password setup",
    });
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("creates a final SSO session for an active administrator", async () => {
    const ts = String(Date.now());
    const response = await callSsoCallback({
      email: `  ${ADMIN_EMAIL.toUpperCase()}  `,
      ts,
      sig: makeSignature(ADMIN_EMAIL, ts),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin");
    expect(findUserByEmailMock).toHaveBeenCalledWith(ADMIN_EMAIL);
    expect(createSessionMock).toHaveBeenCalledWith({
      uid: "admin-1",
      role: UserRole.ADMIN,
      email: ADMIN_EMAIL,
      fullName: "SSO Admin",
      authMethod: "sso",
    });
    expect(clearInitialSetupSessionMock).toHaveBeenCalledOnce();
    expect(clearInitialSetupSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      createSessionMock.mock.invocationCallOrder[0],
    );
    expect(createAdminAuditLogMock).toHaveBeenCalledWith({
      adminUserId: "admin-1",
      action: "ADMIN_SSO_LOGIN_SUCCESS",
      targetType: "Auth",
      targetId: "admin-1",
      meta: {
        authMethod: "sso",
        authenticationStage: "final",
      },
    });
    expect(JSON.stringify(createAdminAuditLogMock.mock.calls)).not.toMatch(
      /shared|secret|sig|signature|token/i,
    );
  });
});
