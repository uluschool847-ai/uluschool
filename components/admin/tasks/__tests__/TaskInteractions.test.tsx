import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateTaskStatusActionMock = vi.hoisted(() => vi.fn());
const assignTaskActionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(admin)/admin/tasks/actions", () => ({
  updateTaskStatusAction: updateTaskStatusActionMock,
  assignTaskAction: assignTaskActionMock,
}));

type TaskCardProps = {
  task: {
    id: string;
    title: string;
    description: string;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    taskType?: string;
    assignedToId?: string | null;
    assignedTo?: { id: string; fullName: string; email: string } | null;
    dueDate: Date | string;
    meta?: { enquiryId?: string; leadId?: string; href?: string };
    relatedEnquiry?: { id: string; studentName: string; email: string } | null;
  };
  adminOptions?: Array<{ id: string; fullName: string; email: string }>;
};

type TaskStatusToggleProps = {
  taskId: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
};

async function loadTaskCard() {
  const specifier = "@/components/admin/tasks/TaskCard";
  return import(/* @vite-ignore */ specifier) as Promise<{
    TaskCard: React.ComponentType<TaskCardProps>;
  }>;
}

async function loadTaskStatusToggle() {
  const specifier = "@/components/admin/tasks/TaskStatusToggle";
  return import(/* @vite-ignore */ specifier) as Promise<{
    TaskStatusToggle: React.ComponentType<TaskStatusToggleProps>;
  }>;
}

describe("Admin ManagerTask interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("clicking Complete on TaskCard triggers the status server action", async () => {
    updateTaskStatusActionMock.mockResolvedValueOnce({ success: true });
    const { TaskCard } = await loadTaskCard();

    render(
      <TaskCard
        task={{
          id: "task-1",
          title: "Follow up stale enquiry",
          description: "Call parent.",
          status: "PENDING",
          priority: "HIGH",
          taskType: "STALE_ENQUIRY",
          dueDate: "2026-05-05T10:00:00.000Z",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /complete/i }));

    await waitFor(() => {
      expect(updateTaskStatusActionMock).toHaveBeenCalledWith({
        taskId: "task-1",
        status: "COMPLETED",
      });
    });
  });

  it("TaskStatusToggle reflects optimistic status transition in the UI", async () => {
    updateTaskStatusActionMock.mockResolvedValueOnce({ success: true });
    const { TaskStatusToggle } = await loadTaskStatusToggle();

    render(<TaskStatusToggle taskId="task-2" status="PENDING" />);

    fireEvent.click(screen.getByRole("button", { name: /start|in progress/i }));

    await waitFor(() => {
      expect(updateTaskStatusActionMock).toHaveBeenCalledWith({
        taskId: "task-2",
        status: "IN_PROGRESS",
      });
    });
    expect(screen.getByText(/in_progress|in progress/i)).toBeDefined();
  });

  it("TaskStatusToggle prevents updates on completed tasks", async () => {
    const { TaskStatusToggle } = await loadTaskStatusToggle();

    render(<TaskStatusToggle taskId="task-3" status="COMPLETED" />);

    expect(screen.getByText(/completed/i)).toBeDefined();
    expect(screen.queryByRole("button", { name: /complete|start|in progress/i })).toBeNull();
    expect(updateTaskStatusActionMock).not.toHaveBeenCalled();
  });

  it("TaskCard renders metadata link to related enquiry when present", async () => {
    const { TaskCard } = await loadTaskCard();

    render(
      <TaskCard
        task={{
          id: "task-4",
          title: "Follow up stale enquiry",
          description: "Call parent.",
          status: "PENDING",
          priority: "HIGH",
          taskType: "STALE_ENQUIRY",
          dueDate: "2026-05-05T10:00:00.000Z",
          meta: { enquiryId: "enq-1", href: "/admin/enquiries/enq-1" },
          relatedEnquiry: {
            id: "enq-1",
            studentName: "Alice Student",
            email: "maria@example.com",
          },
        }}
      />,
    );

    const card = screen.getByTestId("task-card-task-4");
    expect(
      within(card)
        .getByRole("link", { name: /alice student|enquiry/i })
        .getAttribute("href"),
    ).toBe("/admin/enquiries/enq-1");
  });

  it("TaskCard assigns a task to an active admin option", async () => {
    assignTaskActionMock.mockResolvedValueOnce({
      success: true,
      message: "Task assignment updated",
    });
    const { TaskCard } = await loadTaskCard();

    render(
      <TaskCard
        adminOptions={[
          { id: "admin-1", fullName: "Fixed Admin", email: "fixed.admin@example.com" },
          { id: "admin-2", fullName: "Second Admin", email: "second.admin@example.com" },
        ]}
        task={{
          id: "task-5",
          title: "Follow up",
          description: "Call parent.",
          status: "PENDING",
          dueDate: "2026-05-05T10:00:00.000Z",
          assignedToId: null,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/assign admin/i), { target: { value: "admin-2" } });

    await waitFor(() => {
      expect(assignTaskActionMock).toHaveBeenCalledWith({
        taskId: "task-5",
        adminId: "admin-2",
      });
    });
    expect(screen.getByText(/assigned: second admin/i)).toBeDefined();
  });
});
