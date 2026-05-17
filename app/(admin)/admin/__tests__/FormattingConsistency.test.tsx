import { cleanup, render } from "@testing-library/react";
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

import AdminDashboardPage from "@/app/(admin)/admin/page";

const fullMonthDateRegex =
  /\b\d{2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/;
const twelveHourTimeRegex = /\b\d{1,2}:\d{2} (AM|PM)\b/;
const shortMonthRegex = /\b\d{2} (Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/;
const snakeCaseStatusRegex = /\bin_progress\b|\bconverted\b|\brejected\b|\bnew\b/;

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

describe("Admin dashboard formatting consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    getSubmissionsMock.mockImplementation(({ entityType }: { entityType: string }) =>
      Promise.resolve(
        entityType === "enquiry"
          ? [
              {
                id: "enq-1",
                referenceId: "MS-2026-0042",
                studentName: "Amina Student",
                parentGuardianName: "Parent One",
                email: "parent@example.com",
                phoneWhatsapp: "+254700000000",
                additionalNotes: "Needs algebra support",
                createdAt: new Date("2026-06-05T09:15:00.000Z"),
              },
            ]
          : [
              {
                id: "lead-1",
                referenceId: "MS-2026-0043",
                fullName: "Lead One",
                email: "lead@example.com",
                phoneWhatsapp: "+254711111111",
                studentGrade: "Year 9",
                message: "Interested in a trial lesson",
                createdAt: new Date("2026-06-06T10:45:00.000Z"),
              },
            ],
      ),
    );
    getAdminAnalyticsOverviewMock.mockResolvedValue({
      totalApplications: 3,
      acceptedApplications: 1,
      conversionRate: 33.3,
      totalContactLeads: 2,
      trafficSources: [{ source: "Website", count: 3 }],
    });
    listRecentAdminAuditLogsMock.mockResolvedValue([
      {
        id: "log-1",
        action: "UPDATED_STATUS",
        targetType: "ENQUIRY",
        targetId: "enq-1",
        createdAt: new Date("2026-06-07T08:30:00.000Z"),
        adminUser: {
          fullName: "Admin User",
          email: "admin@example.com",
        },
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders application and audit timestamps in one full-month date style", async () => {
    const { container } = await renderServerComponent(<AdminDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(fullMonthDateRegex);
    expect(text).not.toMatch(shortMonthRegex);
  });

  it("renders timestamps in one consistent 12-hour time format across submissions and audit logs", async () => {
    const { container } = await renderServerComponent(<AdminDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(twelveHourTimeRegex);
    expect(text).not.toMatch(/\b([01]?\d|2[0-3]):\d{2}\b(?!\s?(AM|PM))/);
  });

  it("uses human-readable status labels in admin filters instead of snake_case enum names", async () => {
    const { container } = await renderServerComponent(<AdminDashboardPage />);
    const text = container.textContent ?? "";

    expect(text).toContain("In Progress");
    expect(text).not.toMatch(snakeCaseStatusRegex);
  });
});
