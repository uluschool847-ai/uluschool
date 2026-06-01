import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionStateMock = vi.hoisted(() => vi.fn());
const useFormStatusMock = vi.hoisted(() => vi.fn());
const actionMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState: useActionStateMock };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return { ...actual, useFormStatus: useFormStatusMock };
});

vi.mock("@/app/(admin)/admin/actions", () => ({
  runReminderDispatchAction: actionMock,
}));

import { ReminderDispatchControls } from "@/components/admin/reminders/ReminderDispatchControls";

describe("ReminderDispatchControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActionStateMock.mockReturnValue([{ status: "idle", message: "" }, actionMock]);
    useFormStatusMock.mockReturnValue({ pending: false });
  });

  afterEach(() => cleanup());

  it("renders manual run and dry-run controls", () => {
    render(<ReminderDispatchControls />);

    expect(screen.getByRole("button", { name: /run reminder job now/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /dry run reminder job/i })).toBeDefined();
  });

  it("shows pending feedback while the action is running", () => {
    useFormStatusMock.mockReturnValue({ pending: true });

    render(<ReminderDispatchControls />);

    expect(screen.getAllByRole("button", { name: /running/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { busy: true }).length).toBeGreaterThan(0);
  });

  it("shows success feedback from a completed dry run", () => {
    useActionStateMock.mockReturnValue([
      {
        status: "success",
        message:
          "Dry run completed. 3 reminders would be sent after scanning 2 classes and 1 assignments.",
      },
      actionMock,
    ]);

    render(<ReminderDispatchControls />);

    expect(screen.getByRole("status").textContent).toMatch(/dry run completed/i);
  });

  it("shows error feedback for processing or network failures", () => {
    useActionStateMock.mockReturnValue([
      {
        status: "error",
        message:
          "Reminder job failed. No success audit was written. Try again or check the server logs.",
      },
      actionMock,
    ]);

    render(<ReminderDispatchControls />);

    expect(screen.getByRole("alert").textContent).toMatch(/reminder job failed/i);
  });
});
