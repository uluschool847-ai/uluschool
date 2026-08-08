import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/sections/page-hero", () => ({ PageHero: () => null }));
vi.mock("@/components/sections/safeguarding-section", () => ({
  SafeguardingSection: () => null,
}));

import AboutPage from "@/app/about/page";

afterEach(() => cleanup());

describe("About page founder identity", () => {
  it("places Sir Nickson Onyango and his photo above the founder's message", () => {
    render(<AboutPage />);

    const founderPhoto = screen.getByRole("img", { name: "Sir Nickson Onyango" });
    const founderName = screen.getByText("Sir Nickson Onyango");
    const founderHeading = screen.getByRole("heading", { name: "Founder's Message" });

    expect(founderPhoto).toHaveAttribute("src", "/nick.jpg");
    expect(
      founderPhoto.compareDocumentPosition(founderHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      founderName.compareDocumentPosition(founderHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
