import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssignmentDetailView } from "@/app/portal/student/components/AssignmentDetailView";

describe("AssignmentDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders assignment title, description, and due date", () => {
    render(
      <AssignmentDetailView
        assignment={{
          id: "assign-1",
          title: "IGCSE Chemistry Homework",
          description: "Complete balancing equations worksheet.",
          dueDate: "2026-08-10T09:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText(/igcse chemistry homework/i)).toBeDefined();
    expect(screen.getByText(/complete balancing equations worksheet/i)).toBeDefined();
    expect(screen.getByText(/due|10|aug|2026/i)).toBeDefined();
  });
});
