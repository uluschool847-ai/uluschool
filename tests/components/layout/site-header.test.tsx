import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SiteHeader } from "../../../components/layout/site-header";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
}));

// Mock next/link to render standard <a> tags for testing hrefs
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("SiteHeader Navigation", () => {
  beforeEach(() => {
    // Mock fetch for the session check to return an unauthenticated state by default
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      })
    ) as any;
  });

  it("renders primary public navigation links with correct expected hrefs", () => {
    render(<SiteHeader />);
    
    // Check About link
    // We use getAllByRole because there are usually desktop and mobile variants
    const aboutLinks = screen.getAllByRole("link", { name: /About/i });
    expect(aboutLinks.length).toBeGreaterThan(0);
    aboutLinks.forEach((link) => {
      expect(link.getAttribute("href")).toBe("/about");
    });

    // Check Pricing link (Expected to fail if not implemented or mapped incorrectly)
    const pricingLinks = screen.getAllByRole("link", { name: /Pricing/i });
    expect(pricingLinks.length).toBeGreaterThan(0);
    pricingLinks.forEach((link) => {
      // Must exactly be /pricing (NOT /pricing-v2)
      expect(link.getAttribute("href")).toBe("/pricing");
    });

    // Check Contact link
    const contactLinks = screen.getAllByRole("link", { name: /Contact/i });
    expect(contactLinks.length).toBeGreaterThan(0);
    contactLinks.forEach((link) => {
      expect(link.getAttribute("href")).toBe("/contact");
    });
  });

  it("renders CTA and Authentication links pointing to correct portal routes", () => {
    render(<SiteHeader />);
    
    // Check Login CTA
    const loginLinks = screen.getAllByRole("link", { name: /Log In/i });
    expect(loginLinks.length).toBeGreaterThan(0);
    loginLinks.forEach((link) => {
      expect(link.getAttribute("href")).toBe("/portal/login");
      expect(link.getAttribute("href")).not.toBe("/portal-old"); // Ensure no legacy links
    });

    // Check Enroll/Sign Up CTA
    const enrollLinks = screen.getAllByRole("link", { name: /Enroll Now/i });
    expect(enrollLinks.length).toBeGreaterThan(0);
    enrollLinks.forEach((link) => {
      expect(link.getAttribute("href")).toBe("/admissions");
    });
  });

  it("ensures no public navigation items have dead ends (empty or placeholder hrefs)", () => {
    render(<SiteHeader />);
    const allLinks = screen.getAllByRole("link");
    
    // Expecting at least some links to exist
    expect(allLinks.length).toBeGreaterThan(0);

    for (const link of allLinks) {
      const href = link.getAttribute("href");
      expect(href).toBeDefined();
      expect(href).not.toBe("");
      expect(href).not.toBe("#");
    }
  });
});
