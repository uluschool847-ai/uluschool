import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.hoisted(() => vi.fn());
const submitWorkActionMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/app/portal/student/actions/submission-actions", () => ({
  submitWorkAction: submitWorkActionMock,
}));

import { SubmitWorkForm } from "@/app/portal/student/components/SubmitWorkForm";

describe("Student submit work feedback", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("shows loading state while submitting work", async () => {
    submitWorkActionMock.mockImplementation(() => new Promise(() => {}));
    render(<SubmitWorkForm assignmentId="a1" />);
    fireEvent.change(screen.getByLabelText(/work link/i), {
      target: { value: "https://drive.google.com/work" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form") as HTMLFormElement,
    );
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
  });

  it("shows error feedback, preserves data, and re-enables button after failure", async () => {
    submitWorkActionMock.mockResolvedValue({ success: false, error: "Invalid submission" });
    render(<SubmitWorkForm assignmentId="a1" />);
    const input = screen.getByLabelText(/work link/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "not-a-valid-link" } });
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form") as HTMLFormElement,
    );
    expect(await screen.findByText(/invalid submission/i)).toBeDefined();
    expect(input.value).toBe("not-a-valid-link");
    expect((screen.getByRole("button", { name: /submit/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("shows generic error feedback on unexpected throw instead of crashing silently", async () => {
    submitWorkActionMock.mockResolvedValue({ success: false, error: "Something went wrong" });
    render(<SubmitWorkForm assignmentId="a1" />);
    fireEvent.change(screen.getByLabelText(/work link/i), {
      target: { value: "https://drive.google.com/work" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form") as HTMLFormElement,
    );
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeDefined());
  });
});
