import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";

type SubjectFiltersProps = {
  searchQuery?: string;
  isActive?: boolean;
};

async function loadSubjectFilters() {
  const specifier = "@/components/admin/subjects/SubjectFilters";
  return import(/* @vite-ignore */ specifier) as Promise<{
    SubjectFilters: React.ComponentType<SubjectFiltersProps>;
  }>;
}

describe("SubjectFilters admin controls", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders search and active-state filters with current values", async () => {
    const { SubjectFilters } = await loadSubjectFilters();

    render(<SubjectFilters searchQuery="bio" isActive={false} />);

    expect(screen.getByLabelText(/search subjects/i)).toBeDefined();
    expect(screen.getByDisplayValue("bio")).toBeDefined();
    expect(screen.getByLabelText(/status|active state/i)).toBeDefined();
    expect(screen.getByRole("option", { name: /all/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^active$/i })).toBeDefined();
    expect(screen.getByRole("option", { name: /^inactive$/i })).toBeDefined();
    expect(screen.getByDisplayValue("false")).toBeDefined();
    expect(screen.getByRole("button", { name: /apply|filter|search/i })).toBeDefined();
    expect(
      screen.queryByRole("link", { name: /reset|clear/i }) ??
        screen.queryByRole("button", { name: /reset|clear/i }),
    ).toBeDefined();
  });

  it("renders an unfiltered default state", async () => {
    const { SubjectFilters } = await loadSubjectFilters();

    render(<SubjectFilters />);

    expect(screen.getByLabelText(/search subjects/i)).toBeDefined();
    expect(screen.getByLabelText(/status|active state/i)).toBeDefined();
    expect(screen.getByDisplayValue("all")).toBeDefined();
  });
});
