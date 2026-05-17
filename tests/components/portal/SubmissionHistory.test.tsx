import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmissionHistory } from "@/app/portal/student/components/SubmissionHistory";

describe("SubmissionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders "Not Submitted" when there is no submission history', () => {
    render(<SubmissionHistory submissions={[]} />);

    expect(screen.getByText(/not submitted/i)).toBeDefined();
  });

  it('renders "Ungraded" state with submission timestamp', () => {
    render(
      <SubmissionHistory
        submissions={[
          {
            id: "sub-1",
            contentUrl: "https://drive.test/sub-v1",
            submittedAt: "2026-08-01T10:30:00.000Z",
            grade: null,
            feedback: null,
          },
        ]}
      />,
    );

    expect(screen.getByText(/ungraded/i)).toBeDefined();
    expect(screen.getByText(/2026|aug|01|10:30|submitted/i)).toBeDefined();
  });

  it('renders "Graded" state with teacher grade and feedback', () => {
    render(
      <SubmissionHistory
        submissions={[
          {
            id: "sub-2",
            contentUrl: "https://drive.test/sub-v2",
            submittedAt: "2026-08-03T08:00:00.000Z",
            grade: 88,
            feedback: "Strong structure. Improve final explanation.",
          },
        ]}
      />,
    );

    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/88/)).toBeDefined();
    expect(screen.getByText(/strong structure\. improve final explanation\./i)).toBeDefined();
  });
});
