import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "../../../components/layout/site-footer";

// Mock next/link to render standard <a> tags for testing hrefs
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("SiteFooter Navigation", () => {
  it("renders all footer links with correct non-broken paths", () => {
    render(<SiteFooter />);

    // Check standard policy links
    const privacyLink = screen.getByRole("link", { name: /Privacy Policy/i });
    expect(privacyLink.getAttribute("href")).toBe("/privacy-policy");

    const termsLink = screen.getByRole("link", { name: /Terms & Conditions/i });
    expect(termsLink.getAttribute("href")).toBe("/terms-and-conditions");

    // Check main navigation duplicated in footer
    const aboutLink = screen.getByRole("link", { name: /About ULU/i });
    expect(aboutLink.getAttribute("href")).toBe("/about");

    const contactLink = screen.getByRole("link", { name: /Contact/i });
    expect(contactLink.getAttribute("href")).toBe("/contact");
  });

  it("ensures no footer links have dead ends (empty or placeholder hrefs)", () => {
    render(<SiteFooter />);
    const allLinks = screen.getAllByRole("link");

    expect(allLinks.length).toBeGreaterThan(0);

    for (const link of allLinks) {
      const href = link.getAttribute("href");
      expect(href).toBeDefined();
      expect(href).not.toBe("");
      expect(href).not.toBe("#");
    }
  });

  it("hides optional contact rows when local contact numbers are not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_PHONE", "");
    vi.stubEnv("NEXT_PUBLIC_CONTACT_WHATSAPP", "");
    vi.resetModules();
    const { SiteFooter: LocalSiteFooter } = await import("../../../components/layout/site-footer");

    render(<LocalSiteFooter />);

    expect(screen.getByText("Email: info@uluglobalacademy.com")).toBeDefined();
    expect(screen.queryByText(/^Phone:/i)).toBeNull();
    expect(screen.queryByText(/^WhatsApp:/i)).toBeNull();
  });
});
