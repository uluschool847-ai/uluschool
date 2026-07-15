import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getEnquiryCaseByIdMock = vi.hoisted(() => vi.fn());
const getContactLeadCaseByIdMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const routerReplaceMock = vi.hoisted(() => vi.fn());
const SERVER_COMPONENT_TEST_TIMEOUT_MS = 15_000;

vi.mock("@/lib/repositories/enquiry-repository", () => ({
  getEnquiryCaseById: getEnquiryCaseByIdMock,
}));

vi.mock("@/lib/repositories/contact-lead-repository", () => ({
  getContactLeadCaseById: getContactLeadCaseByIdMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  usePathname: () => "/admin/enquiries",
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("page=1&q="),
}));

type PageModule = {
  default: (props: { params: Promise<{ id: string }> | { id: string } }) => Promise<JSX.Element>;
};

async function importFutureModule<T>(specifier: string): Promise<T> {
  return import(/* @vite-ignore */ specifier) as Promise<T>;
}

describe("Admin CRM case detail pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "enquiry detail page calls getEnquiryCaseById and displays primary case info",
    async () => {
      getEnquiryCaseByIdMock.mockResolvedValueOnce({
        id: "enq-1",
        studentName: "Alice Student",
        parentGuardianName: "Maria Parent",
        email: "maria@example.com",
        phoneWhatsapp: "+100000000",
        consentVersion: "enrolment-consent-v1",
        consentGivenAt: new Date("2026-07-13T09:30:00.000Z"),
        status: "IN_PROGRESS",
        notes: [
          {
            id: "note-1",
            content: "Parent asked for a Monday callback.",
            authorId: "admin-1",
            createdAt: new Date("2026-06-07T08:30:00.000Z"),
          },
        ],
        timeline: [],
      });

      const page = await importFutureModule<PageModule>("@/app/(admin)/admin/enquiries/[id]/page");
      const element = await page.default({ params: { id: "enq-1" } });

      render(element);

      expect(getEnquiryCaseByIdMock).toHaveBeenCalledWith("enq-1");
      expect(requireRoleMock).toHaveBeenCalledWith(["ADMIN"]);
      expect(screen.getByText(/alice student/i)).toBeDefined();
      expect(screen.getByText(/maria@example\.com/i)).toBeDefined();
      expect(screen.getByText(/\+100000000/i)).toBeDefined();
      expect(screen.getByText(/parent asked for a monday callback/i)).toBeDefined();
      expect(
        screen.getByRole("link", { name: /back to enrolment submissions/i }).getAttribute("href"),
      ).toBe("/admin/submissions");
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it(
    "shows captured consent version and time to an authenticated admin",
    async () => {
      getEnquiryCaseByIdMock.mockResolvedValueOnce({
        id: "enq-1",
        studentName: "Alice Student",
        parentGuardianName: "Maria Parent",
        email: "maria@example.com",
        phoneWhatsapp: "+100000000",
        status: "NEW",
        consentVersion: "enrolment-consent-v1",
        consentGivenAt: new Date("2026-07-13T09:30:00.000Z"),
        notes: [],
        timeline: [],
      });

      const page = await importFutureModule<PageModule>("@/app/(admin)/admin/enquiries/[id]/page");
      render(await page.default({ params: { id: "enq-1" } }));

      expect(screen.getByText(/captured: enrolment-consent-v1 at/i)).toBeDefined();
      expect(requireRoleMock).toHaveBeenCalledWith(["ADMIN"]);
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it(
    "labels a null-consent enquiry as a legacy record",
    async () => {
      getEnquiryCaseByIdMock.mockResolvedValueOnce({
        id: "enq-legacy",
        studentName: "Legacy Student",
        parentGuardianName: "Legacy Parent",
        email: "legacy@example.com",
        phoneWhatsapp: "+100000001",
        status: "NEW",
        consentVersion: null,
        consentGivenAt: null,
        notes: [],
        timeline: [],
      });

      const page = await importFutureModule<PageModule>("@/app/(admin)/admin/enquiries/[id]/page");
      render(await page.default({ params: { id: "enq-legacy" } }));

      expect(screen.getByText("Legacy record - consent evidence not captured.")).toBeDefined();
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it("lead detail page calls getContactLeadCaseById and displays primary lead info", async () => {
    getContactLeadCaseByIdMock.mockResolvedValueOnce({
      id: "lead-1",
      fullName: "Daniel Guardian",
      email: "daniel@example.com",
      phoneWhatsapp: "+200000000",
      status: "NEW",
      notes: [],
      timeline: [],
    });

    const page = await importFutureModule<PageModule>("@/app/(admin)/admin/leads/[id]/page");
    const element = await page.default({ params: { id: "lead-1" } });

    render(element);

    expect(getContactLeadCaseByIdMock).toHaveBeenCalledWith("lead-1");
    expect(requireRoleMock).toHaveBeenCalledWith(["ADMIN"]);
    expect(screen.getByText(/daniel guardian/i)).toBeDefined();
    expect(screen.getByText(/daniel@example\.com/i)).toBeDefined();
    expect(screen.getByText(/\+200000000/i)).toBeDefined();
    expect(screen.getByText(/no admin notes yet/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /back to contact leads/i }).getAttribute("href")).toBe(
      "/admin/leads",
    );
  });

  it("enquiry detail page renders a not-found state for invalid IDs", async () => {
    getEnquiryCaseByIdMock.mockResolvedValueOnce(null);

    const page = await importFutureModule<PageModule>("@/app/(admin)/admin/enquiries/[id]/page");

    await expect(page.default({ params: { id: "missing-enquiry" } })).rejects.toThrow(
      /not_found|not found|NEXT_NOT_FOUND/i,
    );
  });

  it("lead detail page renders a not-found state for invalid IDs", async () => {
    getContactLeadCaseByIdMock.mockResolvedValueOnce(null);

    const page = await importFutureModule<PageModule>("@/app/(admin)/admin/leads/[id]/page");

    await expect(page.default({ params: { id: "missing-lead" } })).rejects.toThrow(
      /not_found|not found|NEXT_NOT_FOUND/i,
    );
  });

  it("CRM list controls update URL search params for search and pagination", async () => {
    const { AdminCrmListControls } = await importFutureModule<{
      AdminCrmListControls: React.ComponentType<{
        basePath: string;
        hasNextPage?: boolean;
        initialPage: number;
        initialQuery: string;
      }>;
    }>("@/components/admin/crm/AdminCrmListControls");

    render(
      <AdminCrmListControls
        basePath="/admin/enquiries"
        hasNextPage={true}
        initialPage={1}
        initialQuery=""
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: /search/i }), {
      target: { value: "biology parent" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/admin/enquiries?page=1&q=biology+parent");
    });

    fireEvent.click(screen.getByRole("button", { name: /next page|page 2/i }));

    expect(routerPushMock).toHaveBeenCalledWith("/admin/enquiries?page=2&q=biology+parent");
  });
});
