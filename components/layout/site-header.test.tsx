import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// We mock usePathname because SiteHeader relies on it
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// We do NOT mock "@/app/student-portal/actions" here because we explicitly
// want this test to fail with a "Module not found" error to catch the broken import.
import { SiteHeader } from "./site-header";

describe("SiteHeader Integration", () => {
  it("renders the header successfully without module resolution errors", () => {
    // If the import fails, this test will crash before even reaching the render block
    const { container } = render(<SiteHeader />);

    // Assert that the component mounted successfully
    expect(container).toBeInTheDocument();
  });
});
