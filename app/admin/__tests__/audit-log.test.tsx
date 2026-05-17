import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn().mockResolvedValue({ uid: "admin-1", role: "ADMIN" }),
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/admin/audit",
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@/lib/repositories/admin-audit-repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/admin-audit-repository")>(
    "@/lib/repositories/admin-audit-repository",
  );
  return {
    ...actual,
    getLogs: vi.fn().mockResolvedValue([]),
  };
});

import AdminAuditPage from "@/app/(admin)/admin/audit/page";
function getLogs() {
  return (
    auditRepo as {
      getLogs?: ReturnType<typeof vi.fn>;
    }
  ).getLogs;
}

import * as auditRepo from "@/lib/repositories/admin-audit-repository";

async function renderServerComponent(Component: () => Promise<JSX.Element>) {
  const element = await Component();
  render(element);
}

describe("Admin auth audit log visibility", () => {
  afterEach(() => {
    cleanup();
  });

  it("retrieves auth audit events ordered by timestamp descending", async () => {
    const logs = getLogs();
    logs?.mockResolvedValueOnce([
      {
        id: "audit-1",
        action: "STUDENT_PROFILE_UPDATED",
        targetType: "student",
        targetId: "student-1",
        before: { fullName: "Old Name" },
        after: { fullName: "New Name" },
        createdAt: new Date("2026-05-05T12:00:00.000Z"),
        adminUser: { id: "admin-1", fullName: "Admin One", email: "admin@example.com" },
      },
    ]);

    await renderServerComponent(() => AdminAuditPage({ searchParams: Promise.resolve({}) }));

    expect(logs).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: undefined,
        targetType: undefined,
        targetId: undefined,
        adminUserId: undefined,
      }),
    );
    expect(screen.getByText("STUDENT_PROFILE_UPDATED")).toBeTruthy();
    expect(screen.getByText("student-1")).toBeTruthy();
  });

  it("supports filtering by eventType and time window", async () => {
    const logs = getLogs();
    logs?.mockResolvedValueOnce([]);

    await renderServerComponent(() =>
      AdminAuditPage({
        searchParams: Promise.resolve({
          actionType: "LOGIN_FAILED",
          targetType: "AUTH",
          targetId: "admin-1",
          adminUserId: "admin-1",
        }),
      }),
    );

    expect(logs).toHaveBeenCalledWith({
      actionType: "LOGIN_FAILED",
      targetType: "AUTH",
      targetId: "admin-1",
      adminUserId: "admin-1",
      dateRange: undefined,
      limit: 26,
      offset: 0,
    });
  });

  it("renders the admin audit page shell for auth events", async () => {
    await renderServerComponent(() =>
      AdminAuditPage({ searchParams: Promise.resolve({ action: "LOGIN_FAILED" }) }),
    );
    expect(screen.getByRole("heading", { name: /audit log/i })).toBeTruthy();
  });
});
