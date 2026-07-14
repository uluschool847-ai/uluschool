import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmissionHistory } from "@/app/portal/student/components/SubmissionHistory";
import { storageUrlForKey } from "@/lib/storage/storage-url";

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    contentUrl: "https://drive.test/sub-v1",
    submittedWorkHref: "https://drive.test/sub-v1",
    submittedAt: "2026-08-01T10:30:00.000Z",
    grade: null,
    feedback: null,
    status: "Pending",
    ...overrides,
  };
}

describe("SubmissionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("handles empty history", () => {
    render(<SubmissionHistory submissions={[]} />);

    expect(screen.getByText(/no submissions yet|not submitted/i)).toBeDefined();
  });

  it("shows submitted timestamp, safe work link, and pending state", () => {
    render(<SubmissionHistory submissions={[submission() as never]} />);

    expect(screen.getByText(/pending/i)).toBeDefined();
    expect(screen.getByText(/2026|aug|01|10:30|submitted/i)).toBeDefined();
    expect(screen.getByRole("link", { name: /submitted work|view work/i })).toHaveAttribute(
      "href",
      "https://drive.test/sub-v1",
    );
  });

  it("shows uploaded work links when the link is under /uploads", () => {
    render(
      <SubmissionHistory
        submissions={[
          submission({
            id: "sub-upload",
            contentUrl: "/uploads/submissions/work.pdf",
            submittedWorkHref: "/uploads/submissions/work.pdf",
          }) as never,
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /submitted work|view work/i })).toHaveAttribute(
      "href",
      "/uploads/submissions/work.pdf",
    );
  });

  it("shows canonical application work links", () => {
    const href = storageUrlForKey("private/students/student-1/submissions/work.pdf");
    render(
      <SubmissionHistory
        submissions={[
          submission({ id: "sub-current", contentUrl: href, submittedWorkHref: href }) as never,
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /submitted work|view work/i })).toHaveAttribute(
      "href",
      href,
    );
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,unsafe"],
    ["file:///C:/secret.pdf"],
    ["http://drive.test/insecure"],
  ])("does not render unsafe submitted work URL %s as an active link", (unsafeUrl) => {
    render(
      <SubmissionHistory
        submissions={[
          submission({
            id: `sub-${unsafeUrl.slice(0, 4)}`,
            contentUrl: unsafeUrl,
            submittedWorkHref: null,
          }) as never,
        ]}
      />,
    );

    expect(screen.queryByRole("link", { name: /submitted work|view work/i })).toBeNull();
    expect(document.body.innerHTML).not.toContain(`href="${unsafeUrl}"`);
  });

  it("shows graded state with grade and feedback", () => {
    render(
      <SubmissionHistory
        submissions={[
          submission({
            id: "sub-2",
            contentUrl: "https://drive.test/sub-v2",
            submittedWorkHref: "https://drive.test/sub-v2",
            submittedAt: "2026-08-03T08:00:00.000Z",
            grade: 88,
            feedback: "Strong structure. Improve final explanation.",
            status: "Graded",
          }) as never,
        ]}
      />,
    );

    expect(screen.getByText(/graded/i)).toBeDefined();
    expect(screen.getByText(/88/)).toBeDefined();
    expect(screen.getByText(/strong structure\. improve final explanation\./i)).toBeDefined();
  });
});
