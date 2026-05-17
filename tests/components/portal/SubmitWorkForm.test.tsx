import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const submitWorkActionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/app/portal/student/actions/submission-actions", () => ({
  submitWorkAction: submitWorkActionMock,
}));

import { SubmitWorkForm } from "@/app/portal/student/components/SubmitWorkForm";

describe("SubmitWorkForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders input fields for student work submission", () => {
    render(<SubmitWorkForm assignmentId="assign-1" />);

    expect(screen.getByLabelText(/work link|submission url|content/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDefined();
  });

  it("calls submitWorkAction with correct payload on valid submit", () => {
    submitWorkActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(<SubmitWorkForm assignmentId="assign-1" />);

    fireEvent.change(screen.getByLabelText(/work link|submission url|content/i), {
      target: { value: "https://drive.test/final-work" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(submitWorkActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: "assign-1",
        contentUrl: "https://drive.test/final-work",
      }),
    );
  });

  it('shows "Resubmit" button label when previous submission exists', () => {
    render(
      <SubmitWorkForm
        assignmentId="assign-1"
        existingSubmission={{
          id: "sub-1",
          contentUrl: "https://drive.test/old-work",
          submittedAt: "2026-08-01T10:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /resubmit/i })).toBeDefined();
  });
});
