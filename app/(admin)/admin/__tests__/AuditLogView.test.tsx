import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getLogsMock = vi.hoisted(() => vi.fn());
const getAuthAuditEventsMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  getLogs: getLogsMock,
  getAuthAuditEvents: getAuthAuditEventsMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/audit",
  useRouter: () => ({
    push: routerPushMock,
    replace: routerPushMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("action=CMS_PAGE_UPDATED&entity=cms_page"),
}));

type PageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element>;
};

type AuditLogFiltersProps = {
  initialActionType?: string;
  initialEntityType?: string;
  initialAdminUserId?: string;
  initialTargetType?: string;
  initialTargetId?: string;
  initialFrom?: string;
  initialTo?: string;
};

async function loadAuditPage() {
  const specifier = "@/app/(admin)/admin/audit/page";
  return import(/* @vite-ignore */ specifier) as Promise<PageModule>;
}

async function loadAuditFilters() {
  const specifier = "@/components/admin/audit/AuditLogFilters";
  return import(/* @vite-ignore */ specifier) as Promise<{
    AuditLogFilters: React.ComponentType<AuditLogFiltersProps>;
  }>;
}

describe("Admin audit log viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    getAuthAuditEventsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("Audit Log page uses entity audit logs and displays real action, target, actor, before, and after values", async () => {
    getLogsMock.mockResolvedValueOnce([
      {
        id: "audit-1",
        action: "STUDENT_PROFILE_UPDATED",
        targetType: "student",
        targetId: "student-1",
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        before: { fullName: "Old Student Name", email: "old.student@example.com" },
        after: { fullName: "New Student Name", email: "new.student@example.com" },
        meta: { source: "student_admin" },
        actorId: "admin-1",
        actorEmail: "snapshot-admin@example.com",
        actorFullName: "Snapshot Admin",
        actorRole: "ADMIN",
        adminUser: {
          id: "admin-1",
          fullName: "Admin One",
          email: "admin1@example.com",
        },
      },
    ]);

    const page = await loadAuditPage();
    const element = await page.default({
      searchParams: { actionType: "STUDENT_PROFILE_UPDATED", targetType: "student" },
    });

    render(element);

    expect(getAuthAuditEventsMock).not.toHaveBeenCalled();
    expect(getLogsMock).toHaveBeenCalledWith({
      actionType: "STUDENT_PROFILE_UPDATED",
      targetType: "student",
      targetId: undefined,
      adminUserId: undefined,
      dateRange: undefined,
      limit: 26,
      offset: 0,
    });
    expect(screen.getByText(/student_profile_updated/i)).toBeDefined();
    expect(screen.getByText(/^student$/i)).toBeDefined();
    expect(screen.getByText(/student-1/i)).toBeDefined();
    expect(screen.getByText(/snapshot admin/i)).toBeDefined();
    expect(screen.getByText(/snapshot-admin@example.com/i)).toBeDefined();
    expect(screen.getByText(/old student name/i)).toBeDefined();
    expect(screen.getByText(/new student name/i)).toBeDefined();
    expect(screen.queryByText(/^AUTH$/)).toBeNull();
  });

  it("Audit Log page accurately displays student, parent, teacher, app user, and payment entity logs", async () => {
    getLogsMock.mockResolvedValueOnce([
      {
        id: "audit-student",
        action: "STUDENT_LEARNING_STATUS_UPDATED",
        targetType: "student",
        targetId: "student-1",
        before: { learningStatus: "ACTIVE" },
        after: { learningStatus: "PAUSED" },
        meta: {},
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        adminUser: { id: "admin-1", fullName: "Admin One", email: "admin1@example.com" },
      },
      {
        id: "audit-parent",
        action: "PARENT_STUDENT_LINKED",
        targetType: "parent",
        targetId: "parent-1",
        before: { studentId: null },
        after: { studentId: "student-1" },
        meta: {},
        createdAt: new Date("2026-05-04T10:01:00.000Z"),
        adminUser: { id: "admin-1", fullName: "Admin One", email: "admin1@example.com" },
      },
      {
        id: "audit-teacher",
        action: "TEACHER_PROFILE_UPDATED",
        targetType: "teacher",
        targetId: "teacher-1",
        before: { title: "Old Title" },
        after: { title: "New Title" },
        meta: {},
        createdAt: new Date("2026-05-04T10:02:00.000Z"),
        adminUser: { id: "admin-1", fullName: "Admin One", email: "admin1@example.com" },
      },
      {
        id: "audit-user",
        action: "APP_USER_ROLE_UPDATED",
        targetType: "app_user",
        targetId: "user-1",
        before: { role: "TEACHER" },
        after: { role: "ADMIN" },
        meta: {},
        createdAt: new Date("2026-05-04T10:03:00.000Z"),
        adminUser: { id: "admin-2", fullName: "Admin Two", email: "admin2@example.com" },
      },
      {
        id: "audit-payment",
        action: "PAYMENT_STATUS_UPDATED",
        targetType: "payment_transaction",
        targetId: "payment-1",
        before: { status: "PENDING" },
        after: { status: "PAID" },
        meta: {},
        createdAt: new Date("2026-05-04T10:04:00.000Z"),
        adminUser: { id: "admin-2", fullName: "Admin Two", email: "admin2@example.com" },
      },
    ]);

    const page = await loadAuditPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(getAuthAuditEventsMock).not.toHaveBeenCalled();
    expect(screen.getByText("STUDENT_LEARNING_STATUS_UPDATED")).toBeDefined();
    expect(screen.getByText("PARENT_STUDENT_LINKED")).toBeDefined();
    expect(screen.getByText("TEACHER_PROFILE_UPDATED")).toBeDefined();
    expect(screen.getByText("APP_USER_ROLE_UPDATED")).toBeDefined();
    expect(screen.getByText("PAYMENT_STATUS_UPDATED")).toBeDefined();
    expect(screen.getByText("payment_transaction")).toBeDefined();
    expect(screen.getByText("student-1")).toBeDefined();
    expect(screen.getByText("parent-1")).toBeDefined();
    expect(screen.getByText("teacher-1")).toBeDefined();
    expect(screen.getByText("user-1")).toBeDefined();
    expect(screen.getByText("payment-1")).toBeDefined();
  });

  it("Audit Log page pretty-prints JSON and redacts sensitive values defensively", async () => {
    getLogsMock.mockResolvedValueOnce([
      {
        id: "audit-sensitive",
        action: "APP_USER_CREATED",
        targetType: "app_user",
        targetId: "user-1",
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        before: null,
        after: {
          email: "safe@example.com",
          passwordHash: "hashed-password",
          nested: { twoFactorSecret: "TOTPSECRET", backupCodes: ["CODE-1"] },
        },
        meta: {},
        adminUser: { id: "admin-1", fullName: "Admin One", email: "admin1@example.com" },
      },
    ]);

    const page = await loadAuditPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(screen.getByText(/^null$/)).toBeDefined();
    expect(screen.getByText(/"email": "safe@example.com"/i)).toBeDefined();
    const rendered = document.body.textContent ?? "";
    expect((rendered.match(/\[REDACTED\]/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(rendered).not.toMatch(/hashed-password|TOTPSECRET|CODE-1/);
    expect(rendered).not.toMatch(/\[object Object\]/);
  });

  it("Audit Log page handles an empty audit history", async () => {
    getLogsMock.mockResolvedValueOnce([]);

    const page = await loadAuditPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(getAuthAuditEventsMock).not.toHaveBeenCalled();
    expect(getLogsMock).toHaveBeenCalledWith({
      actionType: undefined,
      targetType: undefined,
      targetId: undefined,
      adminUserId: undefined,
      dateRange: undefined,
      limit: 26,
      offset: 0,
    });
    expect(screen.getByText(/no audit logs|no recent activity|empty audit history/i)).toBeDefined();
  });

  it("Audit Log page passes admin, target, and action filters to getLogs", async () => {
    getLogsMock.mockResolvedValueOnce([]);

    const page = await loadAuditPage();
    const element = await page.default({
      searchParams: {
        adminUserId: "admin-2",
        targetType: "teacher",
        targetId: "teacher-1",
        actionType: "TEACHER_PROFILE_UPDATED",
      },
    });

    render(element);

    expect(getAuthAuditEventsMock).not.toHaveBeenCalled();
    expect(getLogsMock).toHaveBeenCalledWith({
      adminUserId: "admin-2",
      targetType: "teacher",
      targetId: "teacher-1",
      actionType: "TEACHER_PROFILE_UPDATED",
      dateRange: undefined,
      limit: 26,
      offset: 0,
    });
  });

  it("Audit Log page keeps deleted actor identity from snapshot fields", async () => {
    getLogsMock.mockResolvedValueOnce([
      {
        id: "audit-deleted-actor",
        action: "APP_USER_STATUS_UPDATED",
        targetType: "app_user",
        targetId: "user-1",
        before: { isActive: true },
        after: { isActive: false },
        meta: {},
        actorId: "deleted-admin-1",
        actorEmail: "deleted.admin@example.com",
        actorFullName: "Deleted Admin",
        actorRole: "ADMIN",
        adminUser: null,
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);

    const page = await loadAuditPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(screen.getByText(/deleted admin/i)).toBeDefined();
    expect(screen.getByText(/deleted.admin@example.com/i)).toBeDefined();
    expect(screen.getByText("ADMIN")).toBeDefined();
  });

  it("Audit Log page passes date filters and pagination to getLogs", async () => {
    getLogsMock.mockResolvedValueOnce([]);

    const page = await loadAuditPage();
    const element = await page.default({
      searchParams: {
        from: "2026-05-01",
        to: "2026-05-14",
        page: "3",
      },
    });

    render(element);

    expect(getLogsMock).toHaveBeenCalledWith({
      actionType: undefined,
      targetType: undefined,
      targetId: undefined,
      adminUserId: undefined,
      dateRange: {
        from: new Date("2026-05-01T00:00:00.000Z"),
        to: new Date("2026-05-14T23:59:59.999Z"),
      },
      limit: 26,
      offset: 50,
    });
  });

  it("AuditLogFilters pushes updated search params when action/entity filters are changed", async () => {
    const { AuditLogFilters } = await loadAuditFilters();

    render(<AuditLogFilters initialActionType="CMS_PAGE_UPDATED" initialEntityType="cms_page" />);

    fireEvent.change(screen.getByLabelText(/action type/i), {
      target: { value: "SECURITY_UPDATED" },
    });
    fireEvent.change(screen.getByLabelText(/entity/i), {
      target: { value: "security_settings" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters|filter/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/admin/audit?actionType=SECURITY_UPDATED&targetType=security_settings",
      );
    });
  });

  it("AuditLogFilters can narrow logs by admin user", async () => {
    const { AuditLogFilters } = await loadAuditFilters();

    render(<AuditLogFilters initialAdminUserId="" />);

    fireEvent.change(screen.getByLabelText(/admin user/i), {
      target: { value: "admin-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters|filter/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(expect.stringContaining("adminUserId=admin-2"));
    });
  });

  it("AuditLogFilters applies date filters and resets pagination", async () => {
    const { AuditLogFilters } = await loadAuditFilters();

    render(<AuditLogFilters initialFrom="" initialTo="" />);

    fireEvent.change(screen.getByLabelText(/from/i), {
      target: { value: "2026-05-01" },
    });
    fireEvent.change(screen.getByLabelText(/to/i), {
      target: { value: "2026-05-14" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters|filter/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(expect.stringContaining("from=2026-05-01"));
      expect(routerPushMock).toHaveBeenCalledWith(expect.stringContaining("to=2026-05-14"));
      expect(routerPushMock.mock.calls.at(-1)?.[0]).not.toContain("page=");
    });
  });
});
