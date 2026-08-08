import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/contact/contact-form", () => ({ ContactForm: () => null }));
vi.mock("@/components/sections/faq-section", () => ({ FaqSection: () => null }));
vi.mock("@/components/sections/page-hero", () => ({ PageHero: () => null }));
vi.mock("@/components/sections/safeguarding-section", () => ({
  SafeguardingSection: () => null,
}));

import ContactPage from "@/app/contact/page";

afterEach(() => cleanup());

describe("Contact page public details", () => {
  it("renders the verified phone and WhatsApp as actionable links", () => {
    render(<ContactPage />);

    expect(screen.getByRole("link", { name: "+254 701 256 095" })).toHaveAttribute(
      "href",
      "tel:+254701256095",
    );
    expect(screen.getByRole("link", { name: "+254 706 359 133" })).toHaveAttribute(
      "href",
      "https://wa.me/254706359133",
    );
  });
});
