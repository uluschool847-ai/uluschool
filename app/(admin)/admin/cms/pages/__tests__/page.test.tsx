import { UserRole } from "@prisma/client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const listPagesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/repositories/cms-repository", () => ({
  listPages: listPagesMock,
}));

vi.mock("@/app/(admin)/admin/cms/actions", () => ({
  deletePageAction: vi.fn(),
}));

vi.mock("@/components/admin/ConfirmedSubmit", () => ({
  ConfirmedSubmit: ({ children }: { children: React.ReactNode }) => children,
}));

type CmsPagesModule = {
  default: (props?: {
    searchParams?: Promise<{ cmsMessage?: string }> | { cmsMessage?: string };
  }) => Promise<JSX.Element> | JSX.Element;
};

async function loadCmsPages() {
  const specifier = "@/app/(admin)/admin/cms/pages/page";
  return import(/* @vite-ignore */ specifier) as Promise<CmsPagesModule>;
}

describe("Admin CMS pages list", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: UserRole.ADMIN });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps page identifiers, status, and actions in a locally scrollable table", async () => {
    listPagesMock.mockResolvedValueOnce([
      {
        id: "page-1",
        title: "Admissions",
        slug: "admissions",
        isPublished: true,
        updatedAt: new Date("2026-07-20T10:00:00.000Z"),
      },
    ]);

    const page = await loadCmsPages();
    render(await page.default({}));

    expect(requireRoleMock).toHaveBeenCalledWith([UserRole.ADMIN]);
    expect(screen.getByText("Admissions")).toBeDefined();
    expect(screen.getByText("Published")).toBeDefined();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveProperty(
      "href",
      expect.stringContaining("/admin/cms/pages/page-1"),
    );

    const table = screen.getByRole("table");
    expect(table.className).toContain("min-w-[760px]");
    expect(table.parentElement?.className).toContain("overflow-x-auto");
    expect(screen.getByRole("columnheader", { name: "Status" }).className).toContain(
      "whitespace-nowrap",
    );
    expect(screen.getByRole("columnheader", { name: "Actions" }).className).toContain(
      "whitespace-nowrap",
    );
  });
});
