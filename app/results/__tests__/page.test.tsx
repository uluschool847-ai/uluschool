import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPublishedTestimonialsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/repositories/cms-repository", () => ({
  getPublishedTestimonials: getPublishedTestimonialsMock,
}));

import ResultsPage from "@/app/results/page";

async function renderServerComponent(element: ReactElement) {
  const component = element.type as (props: unknown) => ReactElement | Promise<ReactElement>;
  return render(await component(element.props));
}

function getText(node: ParentNode) {
  return node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("Results page misleading content safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPublishedTestimonialsMock.mockResolvedValue([
      {
        id: "result-1",
        studentName: "Amina K",
        quote: "My daughter became more confident in Mathematics.",
        status: "published",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render sample or no-results-yet placeholder copy", async () => {
    const { container } = await renderServerComponent(<ResultsPage />);
    const text = getText(container);

    expect(text).not.toMatch(/sample|placeholder|dummy|example|no results yet/i);
  });

  it("does not expose sample results test ids or disabled result controls", async () => {
    const { container } = await renderServerComponent(<ResultsPage />);

    expect(container.querySelector('[data-testid="sample-results"]')).toBeNull();
    expect(container.querySelector('[data-testid*="sample-results"]')).toBeNull();
    expect(
      container.querySelector(
        "button[disabled], [role='button'][aria-disabled='true'], [role='switch'][aria-disabled='true']",
      ),
    ).toBeNull();
  });

  it("renders published results content when data exists", async () => {
    await renderServerComponent(<ResultsPage />);

    expect(await screen.findByRole("heading", { name: /academic performance/i })).not.toBeNull();
    expect(screen.getByText(/amina k/i)).not.toBeNull();
    expect(screen.getByText(/more confident in mathematics/i)).not.toBeNull();
  });

  it("renders a proper empty state instead of hardcoded placeholder copy when there are no results", async () => {
    getPublishedTestimonialsMock.mockResolvedValue([]);

    const { container } = await renderServerComponent(<ResultsPage />);
    const text = getText(container);

    expect(text).not.toMatch(/sample|placeholder|dummy|example|no results yet/i);
    expect(text.length).toBeGreaterThan(10);
    expect(
      container.querySelector("button[disabled], [role='button'][aria-disabled='true']"),
    ).toBeNull();
  });
});
