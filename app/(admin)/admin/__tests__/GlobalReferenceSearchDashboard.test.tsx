import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getAdminAnalyticsOverviewMock = vi.hoisted(() => vi.fn());
const listRecentAdminAuditLogsMock = vi.hoisted(() => vi.fn());
const listEnquiriesMock = vi.hoisted(() => vi.fn());
const listContactLeadsMock = vi.hoisted(() => vi.fn());
const getSubmissionsMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const SERVER_COMPONENT_TEST_TIMEOUT_MS = 15_000;

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/analytics-repository", () => ({
  getAdminAnalyticsOverview: getAdminAnalyticsOverviewMock,
}));

vi.mock("@/lib/repositories/admin-audit-repository", () => ({
  listRecentAdminAuditLogs: listRecentAdminAuditLogsMock,
}));

vi.mock("@/lib/repositories/enquiry-repository", () => ({
  listEnquiries: listEnquiriesMock,
}));

vi.mock("@/lib/repositories/contact-lead-repository", () => ({
  listContactLeads: listContactLeadsMock,
}));

vi.mock("@/lib/repositories/admin-submission-repository", () => ({
  getSubmissions: getSubmissionsMock,
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: routerPushMock,
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
    usePathname: () => "/admin",
    useSearchParams: () => new URLSearchParams("page=1&search="),
  };
});

vi.mock("@/app/(admin)/admin/actions", () => ({
  runReminderDispatchAction: vi.fn(),
  updateEnquiryAction: vi.fn(),
  updateContactLeadAction: vi.fn(),
}));

type DashboardPageModule = {
  default: (props: {
    searchParams?:
      | Promise<{ search?: string; page?: string; status?: string }>
      | {
          search?: string;
          page?: string;
          status?: string;
        };
  }) => Promise<JSX.Element>;
};

async function loadDashboardPage() {
  const specifier = "@/app/(admin)/admin/page";
  return import(/* @vite-ignore */ specifier) as Promise<DashboardPageModule>;
}

describe("Admin dashboard global reference search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
    getAdminAnalyticsOverviewMock.mockResolvedValue({
      totalApplications: 0,
      acceptedApplications: 0,
      conversionRate: 0,
      totalContactLeads: 0,
      trafficSources: [],
    });
    listRecentAdminAuditLogsMock.mockResolvedValue([]);
    listEnquiriesMock.mockResolvedValue([]);
    listContactLeadsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "renders AdminCrmListControls on the dashboard and syncs with the search query param",
    async () => {
      const page = await loadDashboardPage();
      const element = await page.default({
        searchParams: Promise.resolve({ search: "", page: "1" }),
      });

      render(element);

      const searchInput = screen.getByRole("searchbox", { name: /search/i });
      expect(searchInput).toBeDefined();

      fireEvent.change(searchInput, { target: { value: "MS-2026-0042" } });
      fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

      await waitFor(() => {
        expect(routerPushMock).toHaveBeenCalledWith("/admin?page=1&search=MS-2026-0042");
      });
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it("fetches filtered mixed results from admin-submission-repository when search is present", async () => {
    getSubmissionsMock
      .mockResolvedValueOnce([
        {
          id: "enq-42",
          referenceId: "MS-2026-0042",
          email: "parent@example.com",
          studentName: "Alice Student",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "lead-42",
          referenceId: "MS-2026-0042",
          email: "contact@example.com",
          fullName: "Alice Parent",
        },
      ]);

    const page = await loadDashboardPage();
    const element = await page.default({
      searchParams: Promise.resolve({ search: "MS-2026-0042", page: "1" }),
    });

    render(element);

    expect(getSubmissionsMock).toHaveBeenNthCalledWith(1, {
      entityType: "enquiry",
      search: "MS-2026-0042",
      page: 1,
      status: null,
    });
    expect(getSubmissionsMock).toHaveBeenNthCalledWith(2, {
      entityType: "lead",
      search: "MS-2026-0042",
      page: 1,
      status: null,
    });
    expect(screen.getByText(/enrolment enquiries/i)).toBeDefined();
    expect(screen.getByText(/contact enquiries/i)).toBeDefined();
    expect(screen.getByText(/alice student/i)).toBeDefined();
    expect(screen.getByText(/alice parent/i)).toBeDefined();
  });

  it("shows a no matching records state on the dashboard when reference search returns nothing", async () => {
    getSubmissionsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const page = await loadDashboardPage();
    const element = await page.default({
      searchParams: Promise.resolve({ search: "MS-2026-9999", page: "1" }),
    });

    render(element);

    expect(screen.getByText(/no matching records found/i)).toBeDefined();
  });

  it("passes valid CRM status filters into dashboard queries", async () => {
    getSubmissionsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const page = await loadDashboardPage();
    const element = await page.default({
      searchParams: Promise.resolve({ status: "In Progress", page: "1" }),
    });

    render(element);

    expect(getSubmissionsMock).toHaveBeenNthCalledWith(1, {
      entityType: "enquiry",
      search: undefined,
      page: 1,
      status: "IN_PROGRESS",
    });
    expect(getSubmissionsMock).toHaveBeenNthCalledWith(2, {
      entityType: "lead",
      search: undefined,
      page: 1,
      status: "IN_PROGRESS",
    });
  });
});
