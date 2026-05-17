import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({
  requireRole: requireRoleMock,
}));

import CMSDashboardPage from "@/app/(admin)/admin/cms/page";

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

describe("CMS dashboard accessibility and responsive behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setViewport(1440);
    requireRoleMock.mockResolvedValue({ uid: "admin-1", role: "ADMIN" });
  });

  afterEach(() => {
    cleanup();
  });

  it("wraps content in a main landmark and exposes exactly one h1", async () => {
    await renderServerComponent(<CMSDashboardPage />);

    expect(screen.getByRole("main")).not.toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("uses labeled region landmarks for each CMS management area", async () => {
    const { container } = await renderServerComponent(<CMSDashboardPage />);

    const labeledSections = container.querySelectorAll(
      "section[aria-label], section[aria-labelledby]",
    );
    expect(labeledSections.length).toBeGreaterThanOrEqual(3);
  });

  it("stacks the CMS cards by default and only expands to multiple columns from md upwards", async () => {
    setViewport(375);
    const { container } = await renderServerComponent(<CMSDashboardPage />);

    const cardGrid = Array.from(container.querySelectorAll("div")).find((node) =>
      node.className.includes("md:grid-cols-3"),
    );

    expect(cardGrid).toBeTruthy();
    expect(cardGrid?.className).not.toMatch(/(^|\s)grid-cols-3(\s|$)/);
  });
});
