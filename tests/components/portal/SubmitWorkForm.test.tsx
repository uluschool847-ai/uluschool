import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const routerRefreshMock = vi.hoisted(() => vi.fn());
const submitWorkActionMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    refresh: routerRefreshMock,
    replace: vi.fn(),
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
    expect(screen.getByRole("button", { name: /^submit$/i })).toBeDefined();
  });

  it("keeps using submitWorkAction with assignmentId and contentUrl only", async () => {
    submitWorkActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(<SubmitWorkForm assignmentId="assign-1" />);

    fireEvent.change(screen.getByLabelText(/work link|submission url|content/i), {
      target: { value: "https://drive.test/final-work" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(submitWorkActionMock).toHaveBeenCalledWith({
        assignmentId: "assign-1",
        contentUrl: "https://drive.test/final-work",
      });
    });
    expect(document.querySelector('input[name="studentId"]')).toBeNull();
    expect(JSON.stringify(submitWorkActionMock.mock.calls)).not.toContain("studentId");
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

  it("shows loading state while submitWorkAction is pending", async () => {
    submitWorkActionMock.mockImplementation(
      () =>
        new Promise(() => {
          // Keep the promise pending so the loading UI remains observable.
        }),
    );

    render(<SubmitWorkForm assignmentId="assign-1" />);

    fireEvent.change(screen.getByLabelText(/work link|submission url|content/i), {
      target: { value: "https://drive.test/final-work" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /submitting|saving/i })).toHaveProperty(
        "disabled",
        true,
      );
    });
  });

  it("shows success feedback and stays in the assignments workflow after success", async () => {
    submitWorkActionMock.mockResolvedValue({ success: true, data: { id: "sub-1" } });

    render(<SubmitWorkForm assignmentId="assign-1" />);

    fireEvent.change(screen.getByLabelText(/work link|submission url|content/i), {
      target: { value: "https://drive.test/final-work" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/submitted|saved|updated/i);
    });

    const pushedAssignmentsRoute = routerPushMock.mock.calls.some(([href]) =>
      String(href).startsWith("/portal/student/assignments"),
    );
    expect(routerRefreshMock.mock.calls.length > 0 || pushedAssignmentsRoute).toBe(true);
  });

  it("shows error feedback without navigating away", async () => {
    submitWorkActionMock.mockResolvedValue({
      success: false,
      error: "Submission URL is required.",
    });

    render(<SubmitWorkForm assignmentId="assign-1" />);

    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/submission url is required/i);
    });
    expect(routerPushMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
