import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FeesPage from "@/app/fees/page";

function getText(node: ParentNode) {
  return node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("Fees page misleading pricing safeguards", () => {
  it("does not render pricing copy that looks like sample or placeholder content", () => {
    const { container } = render(<FeesPage />);
    const text = getText(container);

    expect(text).not.toMatch(/sample|placeholder|dummy|example/i);
  });

  it("does not expose sample pricing markers", () => {
    const { container } = render(<FeesPage />);

    expect(container.querySelector('[data-testid="sample-pricing"]')).toBeNull();
    expect(container.querySelector('[data-testid*="placeholder"]')).toBeNull();
    expect(container.querySelector('[data-testid*="sample"]')).toBeNull();
  });

  it("does not advertise obviously fake zero-price tuition values", () => {
    const { container } = render(<FeesPage />);
    const text = getText(container);

    expect(text).not.toMatch(/\$\s*0\.00/i);
    expect(text).not.toMatch(/\bfree\b/i);
  });

  it("renders real-looking fee values when pricing is shown", () => {
    const { container } = render(<FeesPage />);
    const text = getText(container);
    const moneyMatches = text.match(/[$£€]\s*\d+(?:,\d{3})*(?:\.\d{2})?/g) ?? [];

    expect(text.length).toBeGreaterThan(80);
    if (moneyMatches.length > 0) {
      expect(moneyMatches.every((value) => !/[$£€]\s*0+(?:\.00)?$/i.test(value))).toBe(true);
    }
  });
});
