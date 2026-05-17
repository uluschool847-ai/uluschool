import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSubmissionsMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const routerReplaceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/admin-submission-repository", () => ({
  getSubmissions: getSubmissionsMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("page=1&search="),
  usePathname: () => "/admin/submissions",
}));

type SearchPageModule = {
  default: (props: {
    searchParams?: Promise<{ search?: string; page?: string }> | { search?: string; page?: string };
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadSubmissionsPage() {
  const specifier = "@/app/(admin)/admin/submissions/page";
  return import(/* @vite-ignore */ specifier) as Promise<SearchPageModule>;
}

async function loadLeadsPage() {
  const specifier = "@/app/(admin)/admin/leads/page";
  return import(/* @vite-ignore */ specifier) as Promise<SearchPageModule>;
}

describe("Admin CRM reference search UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a search input on the submissions page and shows only the matching enquiry record", async () => {
    getSubmissionsMock.mockResolvedValueOnce([
      {
        id: "enq-42",
        referenceId: "MS-2026-0042",
        studentName: "Alice Student",
        email: "alice.parent@example.com",
      },
    ]);

    const page = await loadSubmissionsPage();
    const element = await page.default({
      searchParams: Promise.resolve({ search: "MS-2026-0042", page: "1" }),
    });

    render(element);

    expect(getSubmissionsMock).toHaveBeenCalledWith({
      entityType: "enquiry",
      search: "MS-2026-0042",
      page: 1,
    });
    expect(screen.getByRole("searchbox", { name: /search/i })).toBeDefined();
    expect(screen.getByText(/ms-2026-0042/i)).toBeDefined();
    expect(screen.getByText(/alice student/i)).toBeDefined();
    expect(screen.queryByText(/ms-2026-9999/i)).toBeNull();
  });

  it("shows a no-results state on the leads page when the referenceId does not exist", async () => {
    getSubmissionsMock.mockResolvedValueOnce([]);

    const page = await loadLeadsPage();
    const element = await page.default({
      searchParams: Promise.resolve({ search: "MS-2026-9999", page: "1" }),
    });

    render(element);

    expect(getSubmissionsMock).toHaveBeenCalledWith({
      entityType: "lead",
      search: "MS-2026-9999",
      page: 1,
    });
    expect(screen.getByRole("searchbox", { name: /search/i })).toBeDefined();
    expect(screen.getByText(/no results found/i)).toBeDefined();
  });

  it("renders lead detail links on the leads page", async () => {
    getSubmissionsMock.mockResolvedValueOnce([
      {
        id: "lead-42",
        referenceId: "MS-2026-0042",
        fullName: "Daniel Guardian",
        email: "daniel@example.com",
      },
    ]);

    const page = await loadLeadsPage();
    const element = await page.default({
      searchParams: Promise.resolve({ search: "MS-2026-0042", page: "1" }),
    });

    render(element);

    expect(screen.getByText(/daniel guardian/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /open lead details/i }).getAttribute("href")).toBe(
      "/admin/leads/lead-42",
    );
  });

  it("syncs the reference search term into URL query params for deep-linking", async () => {
    getSubmissionsMock.mockResolvedValueOnce([
      {
        id: "enq-42",
        referenceId: "MS-2026-0042",
        studentName: "Alice Student",
      },
    ]);

    const page = await loadSubmissionsPage();
    const element = await page.default({
      searchParams: Promise.resolve({ search: "", page: "1" }),
    });

    render(element);

    fireEvent.change(screen.getByRole("searchbox", { name: /search/i }), {
      target: { value: "MS-2026-0042" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/admin/submissions?page=1&search=MS-2026-0042");
    });
  });
});
