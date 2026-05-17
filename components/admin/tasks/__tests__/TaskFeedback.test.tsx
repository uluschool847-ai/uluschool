import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateTaskStatusActionMock = vi.hoisted(() => vi.fn());
const assignTaskActionMock = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/admin/tasks/actions", () => ({
  updateTaskStatusAction: updateTaskStatusActionMock,
  assignTaskAction: assignTaskActionMock,
}));

import { TaskCard } from "@/components/admin/tasks/TaskCard";
import { TaskStatusToggle } from "@/components/admin/tasks/TaskStatusToggle";

describe("Admin task mutation feedback", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows completing/loading feedback when completing a task", async () => {
    vi.useFakeTimers();
    updateTaskStatusActionMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 10_000)),
    );
    render(
      <TaskCard
        task={{
          id: "task-1",
          title: "Stale enquiry",
          description: "Follow up",
          status: "PENDING",
          dueDate: "2026-05-01",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /complete/i }));
    expect(screen.getByRole("button", { name: /completing/i })).toBeDefined();
  });

  it("shows generic error feedback when task status update fails", async () => {
    updateTaskStatusActionMock.mockResolvedValue({ success: false, error: "Cannot update task" });
    render(<TaskStatusToggle taskId="task-1" status="PENDING" />);
    fireEvent.click(screen.getByRole("button", { name: /start in progress/i }));
    await waitFor(() =>
      expect(screen.getByText(/cannot update task|something went wrong/i)).toBeDefined(),
    );
  });
});
