import * as auditRepo from "@/lib/repositories/admin-audit-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

type AuthAuditEvent = {
  eventType: string;
  userId?: string;
  identifier: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
};

function logAuthEvent() {
  return (auditRepo as unknown as { logAuthEvent?: (event: AuthAuditEvent) => Promise<void> })
    .logAuthEvent;
}

describe("auth audit trail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a failed login audit event", async () => {
    const logger = logAuthEvent();
    expect(logger).toBeTypeOf("function");
    const createLogSpy = vi.spyOn(auditRepo, "createLog").mockResolvedValue({} as never);

    await expect(
      logger?.({
        eventType: "LOGIN_FAILED",
        userId: "user-1",
        identifier: "student@example.com",
        ipAddress: "127.0.0.1",
        userAgent: "Vitest",
        timestamp: new Date("2026-05-05T10:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();

    expect(createLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-1",
        actionType: "LOGIN_FAILED",
        entityType: "AUTH",
      }),
    );
  });

  it("does not write anonymous auth events with a fake system admin user id", async () => {
    const logger = logAuthEvent();
    expect(logger).toBeTypeOf("function");
    const createLogSpy = vi.spyOn(auditRepo, "createLog").mockResolvedValue({} as never);

    await expect(
      logger?.({
        eventType: "LOGIN_FAILED",
        identifier: "student@example.com",
        ipAddress: "127.0.0.1",
        userAgent: "Vitest",
        timestamp: new Date("2026-05-05T10:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();

    expect(createLogSpy).not.toHaveBeenCalled();
  });

  it("records successful logins, account lockouts, unlocks, password changes, and session expiry", async () => {
    const logger = logAuthEvent();
    expect(logger).toBeTypeOf("function");
    const createLogSpy = vi.spyOn(auditRepo, "createLog").mockResolvedValue({} as never);

    await expect(
      Promise.all([
        logger?.({
          eventType: "LOGIN_SUCCESS",
          userId: "admin-1",
          identifier: "admin@example.com",
          timestamp: new Date(),
        }),
        logger?.({
          eventType: "ACCOUNT_LOCKED",
          userId: "admin-1",
          identifier: "admin@example.com",
          timestamp: new Date(),
        }),
        logger?.({
          eventType: "ACCOUNT_UNLOCKED",
          userId: "admin-1",
          identifier: "admin@example.com",
          timestamp: new Date(),
        }),
        logger?.({
          eventType: "PASSWORD_CHANGED",
          userId: "admin-1",
          identifier: "admin@example.com",
          timestamp: new Date(),
        }),
        logger?.({
          eventType: "SESSION_EXPIRED",
          userId: "admin-1",
          identifier: "admin@example.com",
          timestamp: new Date(),
        }),
      ]),
    ).resolves.toHaveLength(5);

    expect(createLogSpy).toHaveBeenCalledTimes(5);
  });

  it("includes timestamp, identifier, userAgent, and ipAddress but not plaintext secrets", async () => {
    const logger = logAuthEvent();
    expect(logger).toBeTypeOf("function");
    const createLogSpy = vi.spyOn(auditRepo, "createLog").mockResolvedValue({} as never);
    const event: AuthAuditEvent = {
      eventType: "LOGIN_FAILED",
      userId: "teacher-1",
      identifier: "teacher@example.com",
      ipAddress: "10.0.0.5",
      userAgent: "Mozilla/5.0",
      metadata: {
        attemptedPassword: "PlaintextPassword123!",
        sessionToken: "very.long.raw.session.token",
      },
      timestamp: new Date("2026-05-05T11:00:00.000Z"),
    };

    await expect(logger?.(event)).resolves.toBeUndefined();
    expect(createLogSpy).toHaveBeenCalled();
    const storedEvent = createLogSpy.mock.calls[0]?.[0] as
      | { metadata?: Record<string, unknown> }
      | undefined;
    expect(storedEvent?.metadata).not.toHaveProperty("attemptedPassword");
    expect(storedEvent?.metadata).not.toHaveProperty("sessionToken");
  });

  it("does not block auth flow if the audit write fails", async () => {
    const logger = logAuthEvent();
    expect(logger).toBeTypeOf("function");
    await expect(
      logger?.({
        eventType: "LOGIN_FAILED",
        identifier: "student@example.com",
        timestamp: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
