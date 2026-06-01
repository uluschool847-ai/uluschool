import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getSubmissionsMock = vi.hoisted(() => vi.fn());
const getAdminAnalyticsOverviewMock = vi.hoisted(() => vi.fn());
const listRecentAdminAuditLogsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/admin-submission-repository", () => ({
  getSubmissions: getSubmissionsMock,
}));

vi.mock("@/lib/repositories/analytics-repository", () => ({
  getAdminAnalyticsOverview: getAdminAnalyticsOverviewMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  listRecentAdminAuditLogs: listRecentAdminAuditLogsMock,
}));

vi.mock("@/app/(admin)/admin/actions", () => ({
  runReminderDispatchAction: vi.fn(),
}));

vi.mock("@/components/admin/crm/AdminCrmListControls", () => ({
  AdminCrmListControls: () => <div data-testid="admin-crm-list-controls">Search controls</div>,
}));

vi.mock("@/components/admin/reminders/ReminderDispatchControls", () => ({
  ReminderDispatchControls: () => (
    <div data-testid="reminder-dispatch-controls">Reminder dispatch controls</div>
  ),
}));

import AdminDashboardPage from "@/app/(admin)/admin/page";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("1024") ? width >= 1024 : width < 1024,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

describe("Admin dashboard accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1440);
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    getSubmissionsMock.mockResolvedValue([]);
    getAdminAnalyticsOverviewMock.mockResolvedValue({
      totalApplications: 0,
      acceptedApplications: 0,
      conversionRate: 0,
      totalContactLeads: 0,
      trafficSources: [],
    });
    listRecentAdminAuditLogsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("wraps the dashboard in a main landmark and exposes exactly one h1", async () => {
    await renderServerComponent(<AdminDashboardPage />);

    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("announces no-match dashboard searches through a status region", async () => {
    await renderServerComponent(
      <AdminDashboardPage searchParams={Promise.resolve({ search: "MS-2026-0042" })} />,
    );

    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("uses labeled section landmarks for the main dashboard regions", async () => {
    const { container } = await renderServerComponent(<AdminDashboardPage />);

    const labeledSections = container.querySelectorAll(
      "section[aria-label], section[aria-labelledby]",
    );
    expect(labeledSections.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps analytics cards stacked by default and only expands them from md upwards", async () => {
    setViewport(375);
    const { container } = await renderServerComponent(<AdminDashboardPage />);

    const analyticsGrid = Array.from(container.querySelectorAll("div")).find((node) =>
      node.className.includes("md:grid-cols-4"),
    );

    expect(analyticsGrid).toBeTruthy();
    expect(analyticsGrid?.className).not.toMatch(/(^|\s)grid-cols-4(\s|$)/);
  });

  it("allows long audit action names to wrap on narrow layouts", async () => {
    listRecentAdminAuditLogsMock.mockResolvedValue([
      {
        id: "audit-1",
        action: "ADMIN_LOGIN_2FA_REQUIRED_DEV_BYPASS",
        targetType: "AUTH",
        targetId: "admin-123",
        createdAt: new Date("2026-05-14T10:00:00.000Z"),
        adminUser: {
          id: "admin-1",
          fullName: "Fixed Admin",
          email: "fixed.admin@uluglobalacademy.com",
        },
      },
    ]);

    const { container } = await renderServerComponent(<AdminDashboardPage />);

    const auditAction = Array.from(container.querySelectorAll("strong")).find(
      (node) => node.textContent === "ADMIN_LOGIN_2FA_REQUIRED_DEV_BYPASS",
    );
    expect(auditAction?.className).toContain("break-all");
  });

  it("keeps standalone admin materials/files intentionally unavailable and documented", async () => {
    await renderServerComponent(<AdminDashboardPage />);

    expect(screen.queryByRole("link", { name: /^materials$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^files$/i })).toBeNull();
    expect(existsSync(path.join(process.cwd(), "app/(admin)/admin/materials/page.tsx"))).toBe(
      false,
    );
    expect(existsSync(path.join(process.cwd(), "app/(admin)/admin/files/page.tsx"))).toBe(false);

    const knownLimitations = readFileSync(
      path.join(process.cwd(), "docs/known-limitations.md"),
      "utf8",
    );
    const adminTestPlan = readFileSync(
      path.join(process.cwd(), "docs/admin-portal-test-plan.md"),
      "utf8",
    );

    expect(knownLimitations).toMatch(/no standalone `\/admin\/materials` or `\/admin\/files`/i);
    expect(knownLimitations).toMatch(/\/portal\/teacher\/materials/i);
    expect(adminTestPlan).toMatch(/intentionally unavailable/i);
    expect(adminTestPlan).toMatch(/app\/api\/upload\/__tests__\/route\.test\.ts/i);
    expect(adminTestPlan).toMatch(/MaterialForm\.test\.tsx/i);
    expect(adminTestPlan).toMatch(/admin-teachers\.spec\.ts/i);
  });
});
