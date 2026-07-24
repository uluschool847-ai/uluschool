import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(admin)/admin/tasks/actions", () => ({
  updateTaskStatusAction: vi.fn(),
  assignTaskAction: vi.fn(),
}));

import { TaskCard } from "@/components/admin/tasks/TaskCard";

describe("TaskCard due date", () => {
  afterEach(cleanup);

  it("renders the due date in en-KE using the Africa/Nairobi calendar day", () => {
    render(
      <TaskCard
        task={{
          id: "task-date",
          title: "Follow up",
          description: "Call parent.",
          status: "PENDING",
          dueDate: "2026-01-31T21:30:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("Due 01/02/2026")).toBeDefined();
  });
});
