import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listParentBillingOverviewMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/billing-repository", () => ({
  formatMoneyMinor: (amountMinor: number, currency = "KES") => `${currency} ${amountMinor / 100}`,
  listParentBillingOverview: listParentBillingOverviewMock,
}));

type PageModule = {
  default: () => Promise<JSX.Element>;
};

async function loadPage() {
  return import("@/app/portal/parent/billing/page") as Promise<PageModule>;
}

describe("Parent billing overview page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("requires PARENT and renders linked child billing summaries", async () => {
    requireRoleMock.mockResolvedValueOnce({ uid: "parent-1", role: "PARENT" });
    listParentBillingOverviewMock.mockResolvedValueOnce({
      children: [
        {
          email: "child@example.com",
          fullName: "Linked Child",
          id: "student-1",
          invoices: [
            { amountMinor: 1200000, currency: "KES", id: "invoice-1", status: "ISSUED" },
            { amountMinor: 900000, currency: "KES", id: "invoice-2", status: "PAID" },
          ],
          payments: [],
          subscriptions: [{ id: "sub-1", planName: "IGCSE Monthly", status: "ACTIVE" }],
        },
      ],
    });

    const Page = (await loadPage()).default;
    render(await Page());

    expect(requireRoleMock).toHaveBeenCalledWith(["PARENT"]);
    expect(listParentBillingOverviewMock).toHaveBeenCalledWith("parent-1");
    const card = screen.getByRole("article", { name: "" });
    expect(within(card).getByText("Linked Child")).toBeInTheDocument();
    expect(within(card).getByText("IGCSE Monthly")).toBeInTheDocument();
    expect(within(card).getAllByText("1")).toHaveLength(2);
    expect(within(card).getByRole("link", { name: "Open child billing" })).toHaveAttribute(
      "href",
      "/portal/parent/billing/student-1",
    );
  });

  it("renders an empty state when the parent has no linked billing records", async () => {
    requireRoleMock.mockResolvedValueOnce({ uid: "parent-empty", role: "PARENT" });
    listParentBillingOverviewMock.mockResolvedValueOnce({ children: [] });

    const Page = (await loadPage()).default;
    render(await Page());

    expect(screen.getByText("No linked child billing records found.")).toBeInTheDocument();
  });
});
