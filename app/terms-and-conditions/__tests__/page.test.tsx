import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Terms and Conditions", () => {
  it("links the configured public contact email", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", "uluschool2@gmail.com");
    vi.resetModules();
    const { default: TermsAndConditionsPage } = await import("@/app/terms-and-conditions/page");

    render(<TermsAndConditionsPage />);

    expect(screen.getByRole("link", { name: "uluschool2@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:uluschool2@gmail.com",
    );
  });
});
