import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findAllTasksMock = vi.hoisted(() => vi.fn());
const listUsersByRoleMock = vi.hoisted(() => vi.fn());
const SERVER_COMPONENT_TEST_TIMEOUT_MS = 15_000;

vi.mock("@/lib/repositories/automation-repository", () => ({
  findAllTasks: findAllTasksMock,
}));

vi.mock("@/lib/repositories/user-repository", () => ({
  listUsersByRole: listUsersByRoleMock,
}));

type TasksPageModule = {
  default: (props?: {
    searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  }) => Promise<JSX.Element>;
};

async function loadTasksPage() {
  const specifier = "@/app/(admin)/admin/tasks/page";
  return import(/* @vite-ignore */ specifier) as Promise<TasksPageModule>;
}

describe("Admin ManagerTask list page", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    listUsersByRoleMock.mockResolvedValue([
      { id: "admin-1", fullName: "Fixed Admin", email: "fixed.admin@example.com" },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "fetches and renders manager tasks",
    async () => {
      findAllTasksMock.mockResolvedValueOnce([
        {
          id: "task-1",
          title: "Follow up stale enquiry",
          description: "Call Maria about the pending enrolment.",
          status: "PENDING",
          priority: "HIGH",
          taskType: "STALE_ENQUIRY",
          assignedToId: null,
          dueDate: new Date("2026-05-05T10:00:00.000Z"),
          relatedEnquiry: {
            id: "enq-1",
            studentName: "Alice Student",
            email: "maria@example.com",
          },
        },
      ]);

      const page = await loadTasksPage();
      const element = await page.default({
        searchParams: { status: "OPEN", priority: "HIGH", assignedAdminId: "admin-1" },
      });

      render(element);

      expect(findAllTasksMock).toHaveBeenCalledWith({
        status: "OPEN",
        priority: "HIGH",
        assignedAdminId: "admin-1",
      });
      expect(listUsersByRoleMock).toHaveBeenCalledWith("ADMIN");
      expect(screen.getByText(/follow up stale enquiry/i)).toBeDefined();
      expect(screen.getByText(/call maria/i)).toBeDefined();
      expect(screen.getByText(/assigned: unassigned/i)).toBeDefined();
    },
    SERVER_COMPONENT_TEST_TIMEOUT_MS,
  );

  it("highlights stale enquiry tasks", async () => {
    findAllTasksMock.mockResolvedValueOnce([
      {
        id: "task-1",
        title: "Follow up on stale enquiry: Alice Student",
        description: "This enquiry needs attention.",
        status: "PENDING",
        priority: "HIGH",
        taskType: "STALE_ENQUIRY",
        assignedToId: null,
        dueDate: new Date("2026-05-05T10:00:00.000Z"),
      },
    ]);

    const page = await loadTasksPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    const card = screen.getAllByTestId("task-card-task-1").at(-1);
    expect(card).toBeDefined();
    expect(within(card).getByText(/stale enquiry/i)).toBeDefined();
    expect(card?.getAttribute("data-task-type")).toBe("STALE_ENQUIRY");
  });

  it("renders an empty state when there are no tasks", async () => {
    findAllTasksMock.mockResolvedValueOnce([]);

    const page = await loadTasksPage();
    const element = await page.default({ searchParams: {} });

    render(element);

    expect(screen.getByText(/no tasks|nothing to do|all caught up/i)).toBeDefined();
  });
});
