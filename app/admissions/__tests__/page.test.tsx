import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AdmissionsPage from "@/app/admissions/page";

const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /sample/i,
  /test content/i,
  /placeholder/i,
  /\btbd\b/i,
  /\btodo\b/i,
  /coming soon(?!:)/i,
];

const UNSUPPORTED_CLAIMS = [
  /real-time analytics/i,
  /ai-powered/i,
  /instant processing/i,
  /live dashboard/i,
  /automatic grading/i,
];

function getPageText(node: ParentNode) {
  return node.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("Admissions public page content quality", () => {
  it("does not render placeholder copy", () => {
    const { container } = render(<AdmissionsPage />);

    const text = getPageText(container);
    for (const pattern of PLACEHOLDER_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it("does not advertise unsupported platform features", () => {
    const { container } = render(<AdmissionsPage />);

    const text = getPageText(container);
    for (const pattern of UNSUPPORTED_CLAIMS) {
      expect(text).not.toMatch(pattern);
    }
  });

  it("renders each major section with meaningful operational text", () => {
    const { container } = render(<AdmissionsPage />);
    const sections = Array.from(container.querySelectorAll("section"));

    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      const sectionText = section.textContent?.replace(/\s+/g, " ").trim() ?? "";
      expect(sectionText.length).toBeGreaterThan(30);
    }
  });

  it("does not show blank or placeholder loading content", () => {
    const { container } = render(<AdmissionsPage />);

    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(getPageText(container).length).toBeGreaterThan(80);
  });
});
